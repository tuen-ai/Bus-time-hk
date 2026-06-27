// 新大嶼山巴士 (NLB) 靜態資料(build 時抽出)。ETA 需要 nlbId(已 bake)。
import raw from '../data/nlbData.json'
import type { Route, RouteStopInfo } from '../api/bus'

interface RawRoute {
  route: string
  id: string // nlbId,ETA 用
  bound: 'I' | 'O'
  st: string
  oTc: string
  dTc: string
  stops: string[]
}
interface RawData {
  routes: RawRoute[]
  stops: Record<string, { n: string; lat: number; lng: number }>
}

const data = raw as RawData
const k = (route: string, bound: string, st: string) => `${route}|${bound}|${st}`
const byKey = new Map(data.routes.map((r) => [k(r.route, r.bound, r.st), r]))

export const nlbRoutes = (): Route[] =>
  data.routes.map((r) => ({
    co: 'nlb',
    route: r.route,
    bound: r.bound,
    service_type: r.st,
    orig_tc: r.oTc,
    dest_tc: r.dTc,
  }))

export const nlbRouteId = (route: string, bound: string, st: string): string | null =>
  byKey.get(k(route, bound, st))?.id ?? null

export function nlbRouteStops(route: string, bound: string, st: string): RouteStopInfo[] {
  const ids = byKey.get(k(route, bound, st))?.stops ?? []
  return ids.map((id, i) => {
    const s = data.stops[id]
    return { seq: i + 1, stopId: id, name: s?.n ?? id, lat: s?.lat ?? 0, lng: s?.lng ?? 0 }
  })
}
