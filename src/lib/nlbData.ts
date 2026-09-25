// 新大嶼山巴士 (NLB) 靜態資料(build 時抽出)。ETA 需要 nlbId(已 bake)。
import raw from '../data/nlbData.json'
import type { Route, RouteStopInfo } from '../api/bus'

export interface NlbRawRoute {
  route: string
  id: string // nlbId,ETA 用(唔唯一:上游會將幾個變體塞埋同一個 id)
  bound: 'I' | 'O'
  st: string
  oTc: string
  dTc: string
  stops: string[]
}
interface RawData {
  routes: NlbRawRoute[]
  stops: Record<string, { n: string; lat: number; lng: number }>
}

const data = raw as RawData

/**
 * 嶼巴變體唯一鍵。route|bound|st 會撞(例如 3M|O|1 有三條:梅窩碼頭→東涌、貝澳→東涌、東涌→梅窩),
 * nlbId 亦唔唯一 → 連埋起訖站先分得開。
 */
export const nlbUid = (r: Pick<NlbRawRoute, 'id' | 'bound' | 'st' | 'oTc' | 'dTc'>): string =>
  `${r.id}:${r.bound}:${r.st}:${r.oTc.trim()}>${r.dTc.trim()}`

const byUid = new Map(data.routes.map((r) => [nlbUid(r), r]))

/** 查路線要用嘅欄位(Route 本身、或者收藏轉出嚟嘅 Route 都得) */
export type NlbQuery = Pick<Route, 'route' | 'bound' | 'service_type' | 'dest_tc' | 'uid'>

/**
 * 揀返對應嘅嶼巴變體:uid 啱就直接用;冇 uid(舊收藏 / 舊快取)就
 * 同號同 st → 同方向 → 同目的地 → 有經過 stopId 嗰條。
 */
export function nlbResolve(q: NlbQuery, stopId?: string): NlbRawRoute | undefined {
  const hit = q.uid ? byUid.get(q.uid) : undefined
  if (hit) return hit
  const same = data.routes.filter((r) => r.route === q.route && r.st === q.service_type)
  const sameBound = same.filter((r) => r.bound === q.bound)
  const dest = q.dest_tc.trim()
  const toDest = (rs: NlbRawRoute[]) => (dest ? rs.filter((r) => r.dTc.trim() === dest) : [])
  // 2026-09 上游將回程 bound 由 O 改做 I → 舊收藏同方向對唔到目的地,就放寬去兩個方向搵
  let pool = toDest(sameBound)
  if (!pool.length) pool = toDest(same)
  if (!pool.length) pool = sameBound.length ? sameBound : same
  return (stopId ? pool.find((r) => r.stops.includes(stopId)) : undefined) ?? pool[0]
}

export const nlbRoutes = (): Route[] =>
  data.routes.map((r) => ({
    co: 'nlb',
    route: r.route,
    bound: r.bound,
    service_type: r.st,
    orig_tc: r.oTc,
    dest_tc: r.dTc,
    uid: nlbUid(r),
  }))

export const nlbRouteId = (q: NlbQuery, stopId?: string): string | null => nlbResolve(q, stopId)?.id ?? null

export function nlbRouteStops(q: NlbQuery): RouteStopInfo[] {
  const ids = nlbResolve(q)?.stops ?? []
  return ids.map((id, i) => {
    const s = data.stops[id]
    return { seq: i + 1, stopId: id, name: s?.n ?? id, lat: s?.lat ?? 0, lng: s?.lng ?? 0 }
  })
}
