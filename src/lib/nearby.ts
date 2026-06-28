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
  mins: number[] // 下一班、下下一班…(最多 3 班)
}

const NEAR_STOPS = 8

export async function nearbyBuses(lat: number, lng: number): Promise<NearbyRow[]> {
  const stopMap = await getStopMap()
  if (stopMap.size === 0) throw new Error('未能載入車站資料,請重試')
  const nearest = [...stopMap.values()]
    .map((s) => ({ s, d: distanceMeters(lat, lng, Number(s.lat), Number(s.long)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, NEAR_STOPS)

  const now = Date.now()
  const batches = await Promise.all(
    nearest.map(async ({ s, d }) => {
      try {
        const etas = await fetchStopEta(s.stop)
        // 同一站同一路線(方向/班次)嘅多班 ETA 聚合成一行
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
  return batches
    .flat()
    .map((r) => ({ ...r, mins: r.mins.slice(0, 3) }))
    .sort((a, b) => (a.mins[0] ?? 999) - (b.mins[0] ?? 999) || a.dist - b.dist)
}
