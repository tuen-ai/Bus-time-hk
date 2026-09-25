// 行程規劃路線圖:離線 route↔stop 圖 + 站座標 + grid 空間索引。
// 資料大(~1.5MB,gzip ~430KB)→ 動態 import,只喺規劃 / 附近城巴綠van 時載入一次。
import { distanceMeters } from './geo'
import { memoAsync } from './cache'
import type { Co, RouteKeyLike } from '../api/bus'

/** planGraph 用上游 co 名(輕鐵叫 lightRail);app 叫 lrt → 一律經 toAppKey 轉 */
export type PlanCo = 'kmb' | 'ctb' | 'nlb' | 'gmb' | 'lightRail'
/** 城巴循環線上游出 OI / IO:成個循環(去程站 + 回程站)一條過 */
export type PlanBound = 'I' | 'O' | 'OI' | 'IO'

export interface PlanRoute {
  k: string // co|route|bound|serviceType
  co: PlanCo
  r: string
  b: PlanBound
  s: string
  o: string
  d: string
  jt: number | null // 全程行車時間(分鐘)
  st: string[] // 站序(stopId)
}
export interface PlanGraph {
  routes: PlanRoute[]
  stops: Record<string, [number, number, string]> // id -> [lat, lng, nameTc]
}

/** planGraph.json 實際格式(v2,scripts/bake-static.mjs 出):站 id 只寫一次,站序用 ids 嘅 index */
export interface PackedGraph {
  v: 2
  ids: string[]
  ll: [number, number][]
  n: string[]
  routes: [PlanCo, string, PlanBound, string, string, string, number | null, number[]][]
}

/** v2 → PlanGraph(舊格式照原樣用);站 index 對唔到 = 資料壞咗,直接拋錯 */
export function inflateGraph(raw: PackedGraph | PlanGraph): PlanGraph {
  if (!('v' in raw)) return raw
  const { ids, ll, n } = raw
  const stops: PlanGraph['stops'] = {}
  for (let i = 0; i < ids.length; i++) stops[ids[i]] = [ll[i][0], ll[i][1], n[i]]
  const routes = raw.routes.map(([co, r, b, s, o, d, jt, st]): PlanRoute => ({
    k: `${co}|${r}|${b}|${s}`,
    co,
    r,
    b,
    s,
    o,
    d,
    jt,
    st: st.map((i) => {
      const id = ids[i]
      if (id === undefined) throw new Error(`planGraph 站 index ${i} 超出範圍`)
      return id
    }),
  }))
  return { routes, stops }
}

export const stopName = (g: PlanGraph, id: string): string => g.stops[id]?.[2] ?? id

export interface Indexed {
  graph: PlanGraph
  routeByIdx: PlanRoute[] // index = route 編號
  stopRoutes: Map<string, { ri: number; seq: number }[]> // stopId -> 經過嘅路線+站序
  grid: Map<string, string[]> // gridKey -> stopIds
  variants: Map<string, number[]> // co|route|bound -> route 編號(循環線搵返單程用)
}

const CELL = 0.0045 // ~500m
const gridKey = (lat: number, lng: number) => `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`

// 成功先記住;失敗(弱網 chunk 載唔到)唔記,下次再 import。大 chunk 慢網要耐啲,唔好 30 秒就放棄
const loadOnce = memoAsync(
  () =>
    import('../data/planGraph.json').then((m) =>
      // JSON 推斷出嚟嘅型別同 tuple 對唔上,要經 unknown;形狀由 planGraph.test.ts 對 committed 檔把關
      buildIndex(inflateGraph(m.default as unknown as PackedGraph | PlanGraph)),
    ),
  Infinity,
  { maxWaitMs: 120_000 },
)

export function loadGraph(): Promise<Indexed> {
  return loadOnce().catch((e: unknown) => {
    // 原始錯誤(Failed to fetch dynamically imported module…)唔好畀用家見到
    throw Object.assign(new Error('路線圖載入唔到,請檢查網絡再試'), { cause: e })
  })
}

export function buildIndex(graph: PlanGraph): Indexed {
  const routeByIdx = graph.routes
  const stopRoutes = new Map<string, { ri: number; seq: number }[]>()
  const variants = new Map<string, number[]>()
  for (let ri = 0; ri < routeByIdx.length; ri++) {
    const { co, r, b, st } = routeByIdx[ri]
    for (let seq = 0; seq < st.length; seq++) {
      const id = st[seq]
      let arr = stopRoutes.get(id)
      if (!arr) stopRoutes.set(id, (arr = []))
      arr.push({ ri, seq })
    }
    const vk = `${co}|${r}|${b}`
    const vs = variants.get(vk)
    if (vs) vs.push(ri)
    else variants.set(vk, [ri])
  }
  const grid = new Map<string, string[]>()
  for (const id in graph.stops) {
    const [lat, lng] = graph.stops[id]
    const key = gridKey(lat, lng)
    let arr = grid.get(key)
    if (!arr) grid.set(key, (arr = []))
    arr.push(id)
  }
  return { graph, routeByIdx, stopRoutes, grid, variants }
}

/** 半徑內最近嘅站(用 grid,封頂 limit 個) */
export function nearStops(
  ix: Indexed,
  lat: number,
  lng: number,
  radiusM = 500,
  limit = 16,
): { id: string; dist: number }[] {
  const cells = Math.ceil(radiusM / 1000 / CELL) + 1
  const cLat = Math.floor(lat / CELL)
  const cLng = Math.floor(lng / CELL)
  const out: { id: string; dist: number }[] = []
  for (let dx = -cells; dx <= cells; dx++) {
    for (let dy = -cells; dy <= cells; dy++) {
      const ids = ix.grid.get(`${cLat + dx}:${cLng + dy}`)
      if (!ids) continue
      for (const id of ids) {
        const [slat, slng] = ix.graph.stops[id]
        const dist = distanceMeters(lat, lng, slat, slng)
        if (dist <= radiusM) out.push({ id, dist })
      }
    }
  }
  return out.sort((a, b) => a.dist - b.dist).slice(0, limit)
}

// ---- planGraph 路線 → app 路線 key ----

/**
 * planGraph 第 ri 條線、喺第 from 個站上車 → app 路線 key(開路線頁 / 查實時 ETA 用)。
 * - lightRail → lrt
 * - 城巴:app 只有 serviceType 1(特別班次當正線開)
 * - 城巴循環線 OI / IO:app 冇呢個 bound,睇上車站喺去程定回程嗰半
 */
export function toAppKey(ix: Indexed, ri: number, from: number): RouteKeyLike {
  const r = ix.routeByIdx[ri]
  const co: Co = r.co === 'lightRail' ? 'lrt' : r.co
  const bound = r.b === 'I' || r.b === 'O' ? r.b : loopHalf(ix, r, from)
  return { co, route: r.r, bound, serviceType: co === 'ctb' ? '1' : r.s }
}

/** 同一方向嘅單程版本(所有班次;正線排先) */
function oneWays(ix: Indexed, r: PlanRoute, b: 'I' | 'O'): PlanRoute[] {
  const vs = (ix.variants.get(`${r.co}|${r.r}|${b}`) ?? []).map((i) => ix.routeByIdx[i])
  return vs.sort((x, y) => Number(y.s === '1') - Number(x.s === '1'))
}

const hasHop = (st: string[], a: string, b: string): boolean => {
  for (let i = 0; i + 1 < st.length; i++) if (st[i] === a && st[i + 1] === b) return true
  return false
}
// 總站唔計(冇得喺終點站上車)
const boardsAt = (st: string[], id: string): boolean => {
  const i = st.indexOf(id)
  return i >= 0 && i < st.length - 1
}

/**
 * 循環線上車站屬邊半程:上車站→下一站呢段 > 站喺邊邊 > 位置(去程總站之前 = 前半)。
 * 頭兩樣睇晒該方向所有班次:淨睇正線會錯,例如城巴 76 正線去程由石排灣開、唔經黃竹坑站,
 * 回程就經 → 喺循環線第一站(黃竹坑站)上車會判咗回程;其實去程特別班就由黃竹坑站開、下一站一樣。
 */
function loopHalf(ix: Indexed, r: PlanRoute, from: number): 'I' | 'O' {
  const first = r.b[0] as 'I' | 'O'
  const second = r.b[1] as 'I' | 'O'
  const fs = oneWays(ix, r, first)
  const ss = oneWays(ix, r, second)
  if (!fs.length || !ss.length) return ss.length && !fs.length ? second : first
  const a = r.st[from]
  const next = r.st[from + 1]
  if (next !== undefined) {
    const hf = fs.some((v) => hasHop(v.st, a, next))
    if (hf !== ss.some((v) => hasHop(v.st, a, next))) return hf ? first : second
  }
  const bf = fs.some((v) => boardsAt(v.st, a))
  if (bf !== ss.some((v) => boardsAt(v.st, a))) return bf ? first : second
  const f = fs[0]
  let split = r.st.indexOf(f.st[f.st.length - 1])
  if (split < 0) split = f.st.length - 1
  return from < split ? first : second
}
