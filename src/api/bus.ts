// 統一營辦商層:KMB + CTB。components 一律用呢度,唔直接 call 個別營辦商。
import * as kmb from './kmb'
import * as ctb from './ctb'
import { getStopMap } from '../lib/store'

export type Co = 'kmb' | 'ctb'

export interface Route {
  co: Co
  route: string
  bound: 'I' | 'O'
  service_type: string
  orig_tc: string
  dest_tc: string
}

export interface Stop {
  stop: string
  name_tc: string
  lat: string
  long: string
}

export interface Eta {
  co: Co
  route: string
  dir: 'I' | 'O'
  service_type: number
  seq: number
  dest_tc: string
  eta_seq: number
  eta: string | null
  rmk_tc: string
  data_timestamp: string
}

export interface RouteStopInfo {
  seq: number
  stopId: string
  name: string
  lat: number
  lng: number
}

export const coLabel = (co: Co): string => (co === 'ctb' ? '城巴' : '九巴')

// ---- 路線清單(KMB + CTB 合併,每日緩存)----
const DAY = 24 * 60 * 60 * 1000
let routeMem: Route[] | null = null

export async function getAllRoutes(): Promise<Route[]> {
  if (routeMem) return routeMem
  try {
    const raw = localStorage.getItem('bus.routes')
    if (raw) {
      const c = JSON.parse(raw) as { ts: number; data: Route[] }
      if (Date.now() - c.ts < DAY) {
        routeMem = c.data
        return c.data
      }
    }
  } catch {
    /* ignore */
  }
  const [k, c] = await Promise.all([
    kmb
      .fetchRoutes()
      .then((rs) =>
        rs.map<Route>((r) => ({
          co: 'kmb',
          route: r.route,
          bound: r.bound,
          service_type: r.service_type,
          orig_tc: r.orig_tc,
          dest_tc: r.dest_tc,
        })),
      )
      .catch(() => [] as Route[]),
    ctb.fetchCtbRoutes().catch(() => [] as Route[]),
  ])
  const all = [...k, ...c]
  routeMem = all
  try {
    localStorage.setItem('bus.routes', JSON.stringify({ ts: Date.now(), data: all }))
  } catch {
    /* 容量不足靜默 */
  }
  return all
}

// ---- 路線站序 + 站名/座標 ----
export async function getRouteStops(r: Route): Promise<RouteStopInfo[]> {
  if (r.co === 'kmb') {
    const [rs, stopMap] = await Promise.all([
      kmb.fetchRouteStops(r.route, r.bound, r.service_type),
      getStopMap(),
    ])
    return rs
      .sort((a, b) => Number(a.seq) - Number(b.seq))
      .map((s) => {
        const info = stopMap.get(s.stop)
        return {
          seq: Number(s.seq),
          stopId: s.stop,
          name: info?.name_tc ?? s.stop,
          lat: Number(info?.lat ?? 0),
          lng: Number(info?.long ?? 0),
        }
      })
  }
  // CTB:逐個站 fetch(並行,有 cache)
  const rs = await ctb.fetchCtbRouteStops(r.route, r.bound)
  const infos = await Promise.all(rs.map((s) => ctb.fetchCtbStop(s.stop)))
  return rs
    .map((s, i) => {
      const info = infos[i]
      return {
        seq: Number(s.seq),
        stopId: s.stop,
        name: info?.name_tc ?? s.stop,
        lat: Number(info?.lat ?? 0),
        lng: Number(info?.long ?? 0),
      }
    })
    .sort((a, b) => a.seq - b.seq)
}

// ---- 指定站 + 路線到站時間 ----
export async function getEta(r: Route, stopId: string): Promise<Eta[]> {
  if (r.co === 'kmb') {
    const data = await kmb.fetchEta(stopId, r.route, r.service_type)
    return data.map((e) => ({ ...e, co: 'kmb' }))
  }
  return ctb.fetchCtbEta(stopId, r.route, r.bound)
}

/** 全線一次過 ETA(供地圖預測用)。CTB 無此 endpoint → 回傳 null。 */
export async function getRouteEta(r: Route): Promise<Eta[] | null> {
  if (r.co !== 'kmb') return null
  const data = await kmb.fetchRouteEta(r.route, r.service_type)
  return data.map((e) => ({ ...e, co: 'kmb' }))
}
