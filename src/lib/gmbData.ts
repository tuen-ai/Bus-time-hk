// GMB 綠色專線小巴 靜態資料。資料大(1149 線 / 4743 站)→ 動態 import lazy load。
import type { Route, RouteStopInfo } from '../api/bus'

interface SmallRoute {
  route: string
  uid: string
  bound: 'I' | 'O'
  st: string
  oTc: string
  dTc: string
}
interface FullRoute extends SmallRoute {
  stops: string[]
}
interface FullData {
  routes: FullRoute[]
  stops: Record<string, { n: string; lat: number; lng: number }>
}

let routesP: Promise<Route[]> | null = null
let fullP: Promise<FullData> | null = null

/** 路線清單(細檔,搜尋用) */
export function gmbRoutesAsync(): Promise<Route[]> {
  if (!routesP) {
    routesP = import('../data/gmbRoutes.json')
      .then((m) =>
        (m.default as SmallRoute[]).map<Route>((r) => ({
          co: 'gmb',
          route: r.route,
          bound: r.bound,
          service_type: r.st,
          orig_tc: r.oTc,
          dest_tc: r.dTc,
          uid: r.uid,
        })),
      )
      .catch(() => [])
  }
  return routesP
}

function full(): Promise<FullData> {
  if (!fullP) {
    fullP = import('../data/gmbData.json')
      .then((m) => m.default as FullData)
      .catch(() => ({ routes: [], stops: {} }))
  }
  return fullP
}

export async function gmbRouteStops(uid: string): Promise<RouteStopInfo[]> {
  const d = await full()
  const r = d.routes.find((x) => x.uid === uid)
  if (!r) return []
  return r.stops.map((id, i) => {
    const s = d.stops[id]
    return { seq: i + 1, stopId: id, name: s?.n ?? id, lat: s?.lat ?? 0, lng: s?.lng ?? 0 }
  })
}
