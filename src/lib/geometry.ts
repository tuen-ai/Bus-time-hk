// 取得路線真實行車幾何。
// 主來源:hkbus/route-waypoints(沿道路 MultiLineString,CORS *,逐條 lazy load)
//   資料:HK Bus Crawling@2021 https://github.com/hkbus/hk-bus-crawling (GPL-2.0)
// Fallback:站對站直線(用 route-stop 各站坐標)
import { lineString } from '@turf/helpers'
import type { Feature, LineString } from 'geojson'
import kmbMap from '../data/kmbGtfs.json'
import ctbMap from '../data/ctbGtfs.json'
import type { Co } from '../api/bus'

// 三層幾何來源:
//   1. same-origin baked(CI 預先抓入 dist/geom,徹底免 runtime 第三方依賴)
//   2. hkbus.github.io route-waypoints(runtime,CORS *)
//   3. OSRM 公開路由(沿道路連接各站)
//   4. 站對站直線(最後手段)
const BAKED_BASE = `${import.meta.env.BASE_URL}geom`
const WAYPOINT_BASE = 'https://hkbus.github.io/route-waypoints'
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

const maps: Record<Co, Record<string, string>> = {
  kmb: kmbMap as Record<string, string>,
  ctb: ctbMap as Record<string, string>,
  lrt: {}, // 輕鐵無 waypoint 幾何 → 用站對站直線
  nlb: {}, // 嶼巴無 hkbus waypoint → OSRM 道路 snap / 直線
}

/** (co, route, bound, serviceType) → gtfsId(用 build-time 精簡映射表) */
export function gtfsIdFor(
  co: Co,
  route: string,
  bound: 'I' | 'O',
  serviceType: string,
): string | null {
  return maps[co][`${route}|${bound}|${serviceType}`] ?? null
}

const cache = new Map<string, Feature<LineString> | null>()

/**
 * 取得路線折線(turf LineString,座標 [lng, lat])。
 * 將 MultiLineString 各段順序串接成一條連續線。失敗回傳 null。
 */
export async function loadRouteLine(
  co: Co,
  route: string,
  bound: 'I' | 'O',
  serviceType: string,
): Promise<Feature<LineString> | null> {
  const gtfsId = gtfsIdFor(co, route, bound, serviceType)
  if (!gtfsId) return null
  const key = `${gtfsId}-${bound === 'O' ? 'O' : 'I'}`
  if (cache.has(key)) return cache.get(key)!

  // 先試 same-origin baked,再試 hkbus runtime
  const line =
    (await fetchWaypointLine(`${BAKED_BASE}/${key}.json`)) ??
    (await fetchWaypointLine(`${WAYPOINT_BASE}/${key}.json`))
  cache.set(key, line)
  return line
}

/** Fetch 一個 route-waypoints 格式檔(MultiLineString)→ 串接成 turf LineString */
async function fetchWaypointLine(url: string): Promise<Feature<LineString> | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const geo = (await res.json()) as {
      features: { geometry: { coordinates: number[][][] } }[]
    }
    const feat = geo.features?.[0]
    if (!feat) return null
    const coords: number[][] = []
    for (const seg of feat.geometry.coordinates) for (const pt of seg) coords.push(pt)
    return coords.length >= 2 ? lineString(coords) : null
  } catch {
    return null
  }
}

/**
 * Fallback:用公開 OSRM 沿道路連接各站坐標,生成接近真實嘅行車線。
 * OSRM demo server 有用量限制,只作冷門路線後備;失敗回傳 null。
 */
export async function lineFromOsrm(
  stops: { lng: number; lat: number }[],
): Promise<Feature<LineString> | null> {
  if (stops.length < 2) return null
  // OSRM 對座標數量有限制,過多時抽樣
  const pts = stops.length > 90 ? sample(stops, 90) : stops
  const coordStr = pts.map((s) => `${s.lng},${s.lat}`).join(';')
  try {
    const res = await fetch(`${OSRM_BASE}/${coordStr}?overview=full&geometries=geojson`)
    if (!res.ok) return null
    const data = (await res.json()) as {
      code: string
      routes?: { geometry: { coordinates: number[][] } }[]
    }
    const coords = data.routes?.[0]?.geometry?.coordinates
    return coords && coords.length >= 2 ? lineString(coords) : null
  } catch {
    return null
  }
}

function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr
  const step = (arr.length - 1) / (n - 1)
  const out: T[] = []
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * step)])
  return out
}

/** Fallback:用站坐標連成直線 */
export function lineFromStops(
  stops: { lng: number; lat: number }[],
): Feature<LineString> | null {
  const coords = stops.map((s) => [s.lng, s.lat])
  return coords.length >= 2 ? lineString(coords) : null
}
