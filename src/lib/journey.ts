// 點對點行程規劃:離線圖 + 直達 + 1 轉乘(meet-in-middle),時間估算 + 車費。
// 無時刻表 → 等候/車程屬估算,僅供參考。
import { loadGraph, nearStops, type Indexed, type PlanRoute } from './planGraph'
import { distanceMeters } from './geo'
import { getFares } from './fares'

const WALK_MPM = 80 // 步行 米/分鐘
const STOP_MIN = 1.6 // 每站分鐘(jt 缺失時)
const BOARD_WAIT = 4 // 每程上車估候車(分鐘)
const TRANSFER_M = 250 // 轉乘最大步行
const NEAR_M = 600 // 起訖搜尋半徑
const MAX_NEAR = 14

export interface Leg {
  kind: 'walk' | 'ride'
  co?: string
  route?: string
  dest?: string
  fromName?: string
  toName?: string
  nStops?: number
  mins: number
}
export interface Journey {
  mins: number
  transfers: number
  fare: number | null
  fareNote?: string
  legs: Leg[]
}

const walkMins = (m: number) => Math.max(1, Math.round(m / WALK_MPM))

function rideMins(r: PlanRoute, from: number, to: number): number {
  const n = to - from
  if (r.jt && r.st.length > 1) return Math.max(1, Math.round((r.jt * n) / (r.st.length - 1)))
  return Math.max(1, Math.round(n * STOP_MIN))
}

interface ReachA { ri: number; bSeq: number; xSeq: number; wO: number; t: number }
interface ReachB { ri: number; ySeq: number; aSeq: number; wD: number; t: number }

export async function planJourneys(
  o: { lat: number; lng: number },
  d: { lat: number; lng: number },
): Promise<Journey[]> {
  const ix = await loadGraph()
  const oStops = nearStops(ix, o.lat, o.lng, NEAR_M, MAX_NEAR)
  const dStops = nearStops(ix, d.lat, d.lng, NEAR_M, MAX_NEAR)
  const dDist = new Map(dStops.map((s) => [s.id, s.dist]))

  const out: Journey[] = []

  // ---- 直達 ----
  for (const os of oStops) {
    for (const { ri, seq: bSeq } of ix.stopRoutes.get(os.id) ?? []) {
      const r = ix.routeByIdx[ri]
      let best: { aSeq: number; w: number } | null = null
      for (let seq = bSeq + 1; seq < r.st.length; seq++) {
        const w = dDist.get(r.st[seq])
        if (w != null && (!best || w < best.w)) best = { aSeq: seq, w }
      }
      if (!best) continue
      const wO = walkMins(os.dist)
      const wD = walkMins(best.w)
      const ride = rideMins(r, bSeq, best.aSeq)
      out.push({
        mins: wO + BOARD_WAIT + ride + wD,
        transfers: 0,
        fare: null,
        legs: [
          ...(wO > 1 ? [{ kind: 'walk' as const, mins: wO, toName: name(ix, r.st[bSeq]) }] : []),
          ride1(ix, r, bSeq, best.aSeq, ride),
          ...(wD > 1 ? [{ kind: 'walk' as const, mins: wD }] : []),
        ],
      })
    }
  }

  // ---- 1 轉乘 ----
  const reachA = buildReachA(ix, oStops)
  const reachB = buildReachB(ix, dStops, dDist)
  // 將 reachB 站建 grid 以便就近匹配
  const gB = new Map<string, string[]>()
  const CELL = 0.0025
  const gk = (la: number, ln: number) => `${Math.floor(la / CELL)}:${Math.floor(ln / CELL)}`
  for (const id of reachB.keys()) {
    const [la, ln] = ix.graph.stops[id]
    const key = gk(la, ln)
    let a = gB.get(key)
    if (!a) gB.set(key, (a = []))
    a.push(id)
  }
  let added = 0
  for (const [xId, a] of reachA) {
    if (added > 400) break
    const [xla, xln] = ix.graph.stops[xId]
    const cl = Math.floor(xla / CELL)
    const cn = Math.floor(xln / CELL)
    for (let dx = -1; dx <= 1 && added <= 400; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const yId of gB.get(`${cl + dx}:${cn + dy}`) ?? []) {
          const [yla, yln] = ix.graph.stops[yId]
          const tw = xId === yId ? 0 : distanceMeters(xla, xln, yla, yln)
          if (tw > TRANSFER_M) continue
          const b = reachB.get(yId)!
          if (a.ri === b.ri) continue // 同一路線唔算轉乘
          const rA = ix.routeByIdx[a.ri]
          const rB = ix.routeByIdx[b.ri]
          const transMins = walkMins(tw) + BOARD_WAIT
          out.push({
            mins: a.t + transMins + b.t,
            transfers: 1,
            fare: null,
            legs: [
              ...(a.wO > 1 ? [{ kind: 'walk' as const, mins: a.wO, toName: name(ix, rA.st[a.bSeq]) }] : []),
              ride1(ix, rA, a.bSeq, a.xSeq, rideMins(rA, a.bSeq, a.xSeq)),
              { kind: 'walk' as const, mins: Math.max(1, walkMins(tw)), toName: name(ix, yId) },
              ride1(ix, rB, b.ySeq, b.aSeq, rideMins(rB, b.ySeq, b.aSeq)),
              ...(b.wD > 1 ? [{ kind: 'walk' as const, mins: b.wD }] : []),
            ],
          })
          added++
        }
      }
    }
  }

  // 去重 + 排序 + 取頭幾個 + 計車費
  const ranked = dedupe(out).sort((x, y) => x.mins - y.mins).slice(0, 6)
  await Promise.all(ranked.map((j) => fillFare(ix, j)))
  return ranked
}

function ride1(ix: Indexed, r: PlanRoute, from: number, to: number, mins: number): Leg {
  return {
    kind: 'ride',
    co: r.co,
    route: r.r,
    dest: r.d,
    fromName: name(ix, r.st[from]),
    toName: name(ix, r.st[to]),
    nStops: to - from,
    mins,
  }
}
const name = (ix: Indexed, id: string) => ix.graph.stops[id]?.[2] ?? id

function buildReachA(ix: Indexed, oStops: { id: string; dist: number }[]) {
  const m = new Map<string, ReachA>()
  for (const os of oStops) {
    const wO = walkMins(os.dist)
    for (const { ri, seq: bSeq } of ix.stopRoutes.get(os.id) ?? []) {
      const r = ix.routeByIdx[ri]
      for (let xSeq = bSeq + 1; xSeq < r.st.length; xSeq++) {
        const t = wO + BOARD_WAIT + rideMins(r, bSeq, xSeq)
        const id = r.st[xSeq]
        const cur = m.get(id)
        if (!cur || t < cur.t) m.set(id, { ri, bSeq, xSeq, wO, t })
      }
    }
  }
  return m
}

function buildReachB(
  ix: Indexed,
  dStops: { id: string; dist: number }[],
  dDist: Map<string, number>,
) {
  const m = new Map<string, ReachB>()
  for (const ds of dStops) {
    const wD = walkMins(ds.dist)
    for (const { ri, seq: aSeq } of ix.stopRoutes.get(ds.id) ?? []) {
      const r = ix.routeByIdx[ri]
      for (let ySeq = 0; ySeq < aSeq; ySeq++) {
        const t = rideMins(r, ySeq, aSeq) + wD
        const id = r.st[ySeq]
        const cur = m.get(id)
        if (!cur || t < cur.t) m.set(id, { ri, ySeq, aSeq, wD, t })
      }
    }
  }
  void dDist
  return m
}

function dedupe(js: Journey[]): Journey[] {
  const seen = new Set<string>()
  const out: Journey[] = []
  for (const j of js) {
    const sig = j.legs.filter((l) => l.kind === 'ride').map((l) => `${l.co}${l.route}`).join('>')
    if (seen.has(sig)) continue
    seen.add(sig)
    out.push(j)
  }
  return out
}

async function fillFare(ix: Indexed, j: Journey): Promise<void> {
  let total = 0
  let unknown = false
  for (const leg of j.legs) {
    if (leg.kind !== 'ride' || !leg.co || !leg.route) continue
    // 搵返該 ride 嘅 route 同 board seq
    const r = ix.routeByIdx.find((x) => x.co === leg.co && x.r === leg.route)
    const fares =
      r && (r.co === 'kmb' || r.co === 'ctb') ? await getFares(r.co, r.r, r.b, r.s) : null
    const boardSeq = r ? r.st.findIndex((s) => name(ix, s) === leg.fromName) : -1
    const f = fares && boardSeq >= 0 && boardSeq < fares.length ? fares[boardSeq] : null
    if (f == null) unknown = true
    else total += f
  }
  j.fare = total > 0 ? Math.round(total * 10) / 10 : null
  if (unknown) j.fareNote = total > 0 ? '部分車費未涵蓋' : '車費未涵蓋'
}
