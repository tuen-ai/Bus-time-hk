// 附近巴士(route-centric):支援九巴 / 城巴 / 綠van,逐營辦商查。
// - KMB:官方 stopList + /stop-eta(一炮一站)
// - CTB:planGraph 站座標 + 逐路線 /eta(冇 stop-eta endpoint,批量發)
// - GMB:planGraph 站座標 + /stop-route + /eta/stop(一站兩炮)
// 另附 localStorage 結果 cache,畀「一開 tab 即有嘢睇」。
import { fetchStopEta, type Stop } from '../api/kmb'
import { fetchCtbEta } from '../api/ctb'
import { fetchGmbStopAll } from '../api/gmb'
import { getStopMap } from './store'
import { distanceMeters } from './geo'
import { minutesUntil } from './time'
import { loadGraph, nearStops, type Indexed } from './planGraph'

export type NearbyCo = 'kmb' | 'ctb' | 'gmb'

export interface NearbyRow {
  co: NearbyCo
  route: string
  dir: 'I' | 'O'
  serviceType: string
  dest: string
  stopId: string
  stopName: string
  dist: number
  mins: number[] // 下一班、下下一班…(最多 3 班)
}

const KMB_STOPS = 8
const GRAPH_STOPS = 5 // ctb/gmb 每次查幾多個站
const MAX_ROUTE_CALLS = 24 // ctb 逐路線上限(防止爆 request)

/** 車號排序:純數字細→大行先(1, 2, 11, 269),之後先到帶英文字母嘅(1A, 269D, N21) */
export function routeCompare(a: string, b: string): number {
  const pureA = /^\d+$/.test(a)
  const pureB = /^\d+$/.test(b)
  if (pureA !== pureB) return pureA ? -1 : 1 // 純數字排先
  const numA = Number(/\d+/.exec(a)?.[0] ?? Infinity)
  const numB = Number(/\d+/.exec(b)?.[0] ?? Infinity)
  if (numA !== numB) return numA - numB // 再按數字部分
  return a.localeCompare(b) // 最後按字面(1A < 1B;N21 之類)
}

export function sortRows(rows: NearbyRow[]): NearbyRow[] {
  return rows
    .map((r) => ({ ...r, mins: r.mins.slice(0, 3) }))
    .sort(
      (a, b) => routeCompare(a.route, b.route) || (a.mins[0] ?? 999) - (b.mins[0] ?? 999) || a.dist - b.dist,
    )
}

// ---- KMB(照舊:官方 stop-eta)----
// 同一位置每 5 秒刷新一次 → 6000+ 個站嘅距離排序記住,唔使每次重計
let nearestMemo: { key: string; list: { s: Stop; d: number }[] } | null = null

function nearestKmbStops(stopMap: Map<string, Stop>, lat: number, lng: number) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
  if (nearestMemo?.key === key) return nearestMemo.list
  const list = [...stopMap.values()]
    .map((s) => ({ s, d: distanceMeters(lat, lng, Number(s.lat), Number(s.long)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, KMB_STOPS)
  nearestMemo = { key, list }
  return list
}

async function nearbyKmb(lat: number, lng: number): Promise<NearbyRow[]> {
  const stopMap = await getStopMap()
  if (stopMap.size === 0) throw new Error('未能載入車站資料,請重試')
  const nearest = nearestKmbStops(stopMap, lat, lng)

  const now = Date.now()
  const batches = await Promise.all(
    nearest.map(async ({ s, d }) => {
      try {
        const etas = await fetchStopEta(s.stop)
        const groups = new Map<string, NearbyRow>()
        for (const e of etas) {
          if (!e.eta) continue
          const m = minutesUntil(e.eta, now)
          if (m == null) continue
          const key = `${e.route}|${e.dir}|${e.service_type}`
          let row = groups.get(key)
          if (!row) {
            row = {
              co: 'kmb',
              route: e.route,
              dir: e.dir,
              serviceType: String(e.service_type),
              dest: e.dest_tc,
              stopId: s.stop,
              stopName: s.name_tc,
              dist: d,
              mins: [],
            }
            groups.set(key, row)
          }
          row.mins.push(m)
        }
        for (const row of groups.values()) row.mins.sort((a, b) => a - b)
        return [...groups.values()]
      } catch {
        return []
      }
    }),
  )
  return sortRows(batches.flat())
}

// ---- planGraph 站(ctb / gmb 共用)----
interface GraphStop {
  id: string
  dist: number
  name: string
}

async function graphNearStops(ix: Indexed, lat: number, lng: number, co: string): Promise<GraphStop[]> {
  const near = nearStops(ix, lat, lng, 500, 40)
  const out: GraphStop[] = []
  for (const n of near) {
    const rs = ix.stopRoutes.get(n.id) ?? []
    if (!rs.some(({ ri }) => ix.routeByIdx[ri].co === co)) continue
    out.push({ id: n.id, dist: n.dist, name: ix.graph.stops[n.id]?.[2] ?? n.id })
    if (out.length >= GRAPH_STOPS) break
  }
  return out
}

// ---- CTB(逐路線 ETA,批量限流)----
async function nearbyCtb(lat: number, lng: number): Promise<NearbyRow[]> {
  const ix = await loadGraph()
  const stops = await graphNearStops(ix, lat, lng, 'ctb')
  if (!stops.length) return []

  // 收集 (站, 路線) 對,cap 總數
  const jobs: { st: GraphStop; route: string; bound: 'I' | 'O'; dest: string }[] = []
  for (const st of stops) {
    const seen = new Set<string>()
    for (const { ri } of ix.stopRoutes.get(st.id) ?? []) {
      const r = ix.routeByIdx[ri]
      if (r.co !== 'ctb') continue
      const k = `${r.r}|${r.b}`
      if (seen.has(k)) continue
      seen.add(k)
      jobs.push({ st, route: r.r, bound: r.b, dest: r.d })
      if (jobs.length >= MAX_ROUTE_CALLS) break
    }
    if (jobs.length >= MAX_ROUTE_CALLS) break
  }

  const now = Date.now()
  const rows: NearbyRow[] = []
  // 8 個一批
  for (let i = 0; i < jobs.length; i += 8) {
    const part = await Promise.all(
      jobs.slice(i, i + 8).map(async (j) => {
        try {
          const etas = await fetchCtbEta(j.st.id, j.route, j.bound)
          const mins = etas
            .map((e) => (e.eta ? minutesUntil(e.eta, now) : null))
            .filter((m): m is number => m != null)
            .sort((a, b) => a - b)
          if (!mins.length) return null
          const row: NearbyRow = {
            co: 'ctb',
            route: j.route,
            dir: j.bound,
            serviceType: '1',
            dest: etas[0]?.dest_tc || j.dest,
            stopId: j.st.id,
            stopName: j.st.name,
            dist: j.st.dist,
            mins,
          }
          return row
        } catch {
          return null
        }
      }),
    )
    rows.push(...part.filter((x): x is NearbyRow => x !== null))
  }
  return sortRows(rows)
}

// ---- GMB(/eta/stop 一站全路線)----
async function nearbyGmb(lat: number, lng: number): Promise<NearbyRow[]> {
  const ix = await loadGraph()
  const stops = await graphNearStops(ix, lat, lng, 'gmb')
  if (!stops.length) return []

  const batches = await Promise.all(
    stops.map(async (st) => {
      const all = await fetchGmbStopAll(st.id)
      return all.map<NearbyRow>((g) => {
        const bound = g.routeSeq === 2 ? 'I' : 'O'
        // 由 planGraph 對返目的地名
        const pr = (ix.stopRoutes.get(st.id) ?? [])
          .map(({ ri }) => ix.routeByIdx[ri])
          .find((r) => r.co === 'gmb' && r.r === g.routeCode && r.b === bound)
        return {
          co: 'gmb',
          route: g.routeCode,
          dir: bound,
          serviceType: '1',
          dest: pr?.d ?? '',
          stopId: st.id,
          stopName: st.name,
          dist: st.dist,
          mins: g.minsList,
        }
      })
    }),
  )
  // 同一路線喺幾個站出現 → 留最近嗰個站
  const best = new Map<string, NearbyRow>()
  for (const r of batches.flat()) {
    const k = `${r.route}|${r.dir}`
    const cur = best.get(k)
    if (!cur || r.dist < cur.dist) best.set(k, r)
  }
  return sortRows([...best.values()])
}

export async function nearbyBuses(lat: number, lng: number, co: NearbyCo): Promise<NearbyRow[]> {
  if (co === 'ctb') return nearbyCtb(lat, lng)
  if (co === 'gmb') return nearbyGmb(lat, lng)
  return nearbyKmb(lat, lng)
}

// ---- 結果 cache(即開即有)----
interface NearbyCache {
  ts: number
  lat: number
  lng: number
  rows: NearbyRow[]
}

const CACHE_TTL = 15 * 60 * 1000

export function readNearbyCache(co: NearbyCo): NearbyCache | null {
  try {
    const c = JSON.parse(localStorage.getItem(`kkcx.nearby.${co}`) || 'null') as NearbyCache | null
    if (c && Date.now() - c.ts < CACHE_TTL && Array.isArray(c.rows) && c.rows.length) return c
  } catch {
    /* ignore */
  }
  return null
}

export function writeNearbyCache(co: NearbyCo, lat: number, lng: number, rows: NearbyRow[]): void {
  try {
    localStorage.setItem(`kkcx.nearby.${co}`, JSON.stringify({ ts: Date.now(), lat, lng, rows }))
  } catch {
    /* ignore */
  }
}
