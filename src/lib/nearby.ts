// 附近巴士:由 GPS 搵最近九巴站,取各站所有路線下一班,攤平成 route-centric 清單。
// (用九巴 stop-eta;九巴站資料有離線座標,覆蓋最廣)
import { fetchStopEta } from '../api/kmb'
import { getStopMap } from './store'
import { distanceMeters } from './geo'
import { minutesUntil } from './time'

export interface NearbyRow {
  co: 'kmb'
  route: string
  dir: 'I' | 'O'
  serviceType: string
  dest: string
  stopId: string
  stopName: string
  dist: number
  mins: number
}

const NEAR_STOPS = 8

export async function nearbyBuses(lat: number, lng: number): Promise<NearbyRow[]> {
  const stopMap = await getStopMap()
  const nearest = [...stopMap.values()]
    .map((s) => ({ s, d: distanceMeters(lat, lng, Number(s.lat), Number(s.long)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, NEAR_STOPS)

  const now = Date.now()
  const batches = await Promise.all(
    nearest.map(async ({ s, d }) => {
      try {
        const etas = await fetchStopEta(s.stop)
        return etas
          .filter((e) => e.eta_seq === 1 && e.eta)
          .map<NearbyRow>((e) => ({
            co: 'kmb',
            route: e.route,
            dir: e.dir,
            serviceType: String(e.service_type),
            dest: e.dest_tc,
            stopId: s.stop,
            stopName: s.name_tc,
            dist: d,
            mins: minutesUntil(e.eta, now) ?? 0,
          }))
      } catch {
        return []
      }
    }),
  )
  return batches.flat().sort((a, b) => a.mins - b.mins || a.dist - b.dist)
}
