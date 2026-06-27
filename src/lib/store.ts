// localStorage 緩存:靜態資料(站點)一日有效;收藏無限期。
import { fetchStops, type Stop } from '../api/kmb'

const DAY = 24 * 60 * 60 * 1000

interface Cached<T> {
  ts: number
  data: T
}

function readCache<T>(key: string, maxAge: number): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cached<T>
    if (Date.now() - parsed.ts > maxAge) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // 容量不足等情況靜默失敗
  }
}

/** 取得站點 Map: stopId -> Stop(每日緩存)。fetch 失敗時回傳空 Map,
 *  令站名 fallback 做 stopId、座標 0,但路線同 ETA 仍可用。 */
export async function getStopMap(): Promise<Map<string, Stop>> {
  let stops = readCache<Stop[]>('kmb.stops', DAY)
  if (!stops) {
    try {
      stops = await fetchStops()
    } catch {
      return new Map()
    }
    if (stops.length > 0) writeCache('kmb.stops', stops) // 唔好快取空陣列
  }
  return new Map(stops.map((s) => [s.stop, s]))
}

// ---- 收藏(路線 + 方向 + 班次 + 站)----

export interface Favorite {
  co: 'kmb' | 'ctb' | 'lrt'
  route: string
  bound: 'I' | 'O'
  serviceType: string
  stopId: string
  stopName: string
  dest: string
}

const FAV_KEY = 'kmb.favorites'

export const favKey = (f: Pick<Favorite, 'co' | 'route' | 'bound' | 'serviceType' | 'stopId'>) =>
  `${f.co}|${f.route}|${f.bound}|${f.serviceType}|${f.stopId}`

export function getFavorites(): Favorite[] {
  try {
    const list = JSON.parse(localStorage.getItem(FAV_KEY) || '[]') as Favorite[]
    // 舊資料無 co,預設 kmb
    return list.map((f) => ({ ...f, co: f.co ?? 'kmb' }))
  } catch {
    return []
  }
}

export function isFavorite(f: Favorite): boolean {
  return getFavorites().some((x) => favKey(x) === favKey(f))
}

export function toggleFavorite(f: Favorite): Favorite[] {
  const list = getFavorites()
  const idx = list.findIndex((x) => favKey(x) === favKey(f))
  if (idx >= 0) list.splice(idx, 1)
  else list.unshift(f)
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(list))
  } catch {
    // Safari 私密模式 / 容量滿:仍回傳記憶體版本令 UI 更新
  }
  return list
}
