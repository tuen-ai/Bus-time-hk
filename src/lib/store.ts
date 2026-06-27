// localStorage 緩存:靜態資料(路線/站點)一日有效;收藏無限期。
import { fetchRoutes, fetchStops, type Route, type Stop } from '../api/kmb'

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

/** 取得路線清單(每日緩存) */
export async function getRoutes(): Promise<Route[]> {
  const cached = readCache<Route[]>('kmb.routes', DAY)
  if (cached) return cached
  const data = await fetchRoutes()
  writeCache('kmb.routes', data)
  return data
}

/** 取得站點 Map: stopId -> Stop(每日緩存) */
export async function getStopMap(): Promise<Map<string, Stop>> {
  let stops = readCache<Stop[]>('kmb.stops', DAY)
  if (!stops) {
    stops = await fetchStops()
    writeCache('kmb.stops', stops)
  }
  return new Map(stops.map((s) => [s.stop, s]))
}

// ---- 收藏(路線 + 方向 + 班次 + 站)----

export interface Favorite {
  route: string
  bound: 'I' | 'O'
  serviceType: string
  stopId: string
  stopName: string
  dest: string
}

const FAV_KEY = 'kmb.favorites'

export const favKey = (f: Pick<Favorite, 'route' | 'bound' | 'serviceType' | 'stopId'>) =>
  `${f.route}|${f.bound}|${f.serviceType}|${f.stopId}`

export function getFavorites(): Favorite[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') as Favorite[]
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
  localStorage.setItem(FAV_KEY, JSON.stringify(list))
  return list
}
