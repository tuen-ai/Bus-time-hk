// 站點快取(IndexedDB,一日有效)+ 收藏(localStorage,無限期、細、要入備份)。
import { fetchStops, type Stop } from '../api/kmb'
import type { Co } from '../api/bus'
import { cacheGet, cachePut } from './kv'

const DAY = 24 * 60 * 60 * 1000
const STOPS_KEY = 'kmb.stops'

let stopMapP: Promise<Map<string, Stop>> | null = null

/** 取得站點 Map: stopId -> Stop(每日緩存)。fetch 失敗時回傳空 Map,
 *  令站名 fallback 做 stopId、座標 0,但路線同 ETA 仍可用。
 *  記憶體亦記住結果 —— 6000+ 個站每次開路線都 JSON.parse 一次好貴。 */
export function getStopMap(): Promise<Map<string, Stop>> {
  if (!stopMapP) {
    stopMapP = (async () => {
      let stops = (await cacheGet<Stop[]>(STOPS_KEY, DAY))?.data ?? null
      if (!stops) {
        try {
          stops = await fetchStops()
        } catch {
          stopMapP = null // 下次再試
          return new Map<string, Stop>()
        }
        if (stops.length > 0) void cachePut(STOPS_KEY, stops) // 唔好快取空陣列
      }
      return new Map(stops.map((s) => [s.stop, s]))
    })()
  }
  return stopMapP
}

// ---- 收藏(路線 + 方向 + 班次 + 站)----

export interface Favorite {
  co: Co
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
