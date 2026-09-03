// 輕鐵靜態資料(build 時由 hkbus 抽出):路線 + 站序 + 站名座標。
import raw from '../data/lrData.json'
import type { Route, RouteStopInfo } from '../api/bus'

interface RawRoute {
  route: string
  bound: 'I' | 'O'
  st: string
  oTc: string
  dTc: string
  stops: string[]
}
interface RawStop {
  n: string
  lat: number
  lng: number
}
interface RawData {
  routes: RawRoute[]
  stops: Record<string, RawStop>
}

const data = raw as RawData

// 輕鐵路綫官方識別色(非 API 提供,自備)
const LR_COLORS: Record<string, string> = {
  '505': '#DA2127',
  '507': '#00A040',
  '610': '#551C24',
  '614': '#00B6F1',
  '614P': '#00B6F1',
  '615': '#FFDD00',
  '615P': '#FFDD00',
  '705': '#73BF43',
  '706': '#B07AB0',
  '751': '#FF9E18',
  '751P': '#FF9E18',
  '761P': '#9C3F97',
}
export const lrColor = (route: string): string => LR_COLORS[route] ?? '#7d3c98'

export const lrRoutes = (): Route[] =>
  data.routes.map((r) => ({
    co: 'lrt',
    route: r.route,
    bound: r.bound,
    service_type: r.st,
    orig_tc: r.oTc,
    dest_tc: r.dTc,
  }))

const key = (route: string, bound: string, st: string) => `${route}|${bound}|${st}`
const stopsByRoute = new Map<string, string[]>(data.routes.map((r) => [key(r.route, r.bound, r.st), r.stops]))

export function lrRouteStops(route: string, bound: string, st: string): RouteStopInfo[] {
  const ids = stopsByRoute.get(key(route, bound, st)) ?? []
  return ids.map((id, i) => {
    const s = data.stops[id]
    return {
      seq: i + 1,
      stopId: id,
      name: s?.n ?? id,
      lat: s?.lat ?? 0,
      lng: s?.lng ?? 0,
    }
  })
}
