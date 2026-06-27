// 取得路線真實行車幾何。
// 主來源:hkbus/route-waypoints(沿道路 MultiLineString,CORS *,逐條 lazy load)
//   資料:HK Bus Crawling@2021 https://github.com/hkbus/hk-bus-crawling (GPL-2.0)
// Fallback:站對站直線(用 route-stop 各站坐標)
import { lineString } from '@turf/helpers'
import type { Feature, LineString } from 'geojson'
import gtfsMap from '../data/kmbGtfs.json'

const WAYPOINT_BASE = 'https://hkbus.github.io/route-waypoints'

const map = gtfsMap as Record<string, string>

/** KMB (route, bound, serviceType) → gtfsId(用 build-time 精簡映射表) */
export function gtfsIdFor(
  route: string,
  bound: 'I' | 'O',
  serviceType: string,
): string | null {
  return map[`${route}|${bound}|${serviceType}`] ?? null
}

const cache = new Map<string, Feature<LineString> | null>()

/**
 * 取得路線折線(turf LineString,座標 [lng, lat])。
 * 將 MultiLineString 各段順序串接成一條連續線。失敗回傳 null。
 */
export async function loadRouteLine(
  route: string,
  bound: 'I' | 'O',
  serviceType: string,
): Promise<Feature<LineString> | null> {
  const gtfsId = gtfsIdFor(route, bound, serviceType)
  if (!gtfsId) return null
  const dir = bound === 'O' ? 'O' : 'I'
  const key = `${gtfsId}-${dir}`
  if (cache.has(key)) return cache.get(key)!

  try {
    const res = await fetch(`${WAYPOINT_BASE}/${key}.json`)
    if (!res.ok) throw new Error(String(res.status))
    const geo = (await res.json()) as {
      features: { geometry: { type: string; coordinates: number[][][] } }[]
    }
    const feat = geo.features?.[0]
    if (!feat) throw new Error('no feature')
    // 串接 MultiLineString 各段
    const coords: number[][] = []
    for (const seg of feat.geometry.coordinates) {
      for (const pt of seg) coords.push(pt)
    }
    const line = coords.length >= 2 ? lineString(coords) : null
    cache.set(key, line)
    return line
  } catch {
    cache.set(key, null)
    return null
  }
}

/** Fallback:用站坐標連成直線 */
export function lineFromStops(
  stops: { lng: number; lat: number }[],
): Feature<LineString> | null {
  const coords = stops.map((s) => [s.lng, s.lat])
  return coords.length >= 2 ? lineString(coords) : null
}
