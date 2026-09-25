// 站點快取(IndexedDB,stale-while-revalidate)+ 收藏(localStorage,無限期、細、要入備份)。
import { fetchStops, type Stop } from '../api/kmb'
import type { Co } from '../api/bus'
import { cacheGet, cachePut } from './kv'
import { validWalk } from './catchable'

const DAY = 24 * 60 * 60 * 1000
const STOPS_KEY = 'kmb.stops'
const STOPS_FRESH = DAY // 過咗就背景刷新
const STOPS_MAX_AGE = 30 * DAY // 九巴站好少變:舊資料都照用,好過顯示 stopId

let stopMapP: Promise<Map<string, Stop>> | null = null

// app 只讀 stop / name_tc / lat / long;name_en / name_sc 唔存,IndexedDB 細一半
// (所以 Map 入面嘅 Stop 冇 name_en / name_sc,唔好讀)
const slim = (s: Stop): Stop => ({ stop: s.stop, name_tc: s.name_tc, lat: s.lat, long: s.long }) as Stop
const toMap = (stops: Stop[]) => new Map(stops.map((s) => [s.stop, s]))

/** 背景攞新站表:成功先寫快取 + 換記憶體版本;失敗靜靜哋照用舊嘅 */
function refreshStops(): void {
  fetchStops()
    .then((all) => {
      if (!all.length) return
      const stops = all.map(slim)
      void cachePut(STOPS_KEY, stops)
      stopMapP = Promise.resolve(toMap(stops))
    })
    .catch(() => {
      // 離線 / API 出事:下次開 app 再試
    })
}

/** 取得站點 Map: stopId -> Stop。快取 1 日內直接用;1–30 日即用 + 背景刷新;
 *  冇快取先等 fetch。fetch 失敗 / 空 → 回傳空 Map(唔記住,下次再試),
 *  令站名 fallback 做 stopId、座標 0,但路線同 ETA 仍可用。
 *  記憶體亦記住結果 —— 6000+ 個站每次開路線都讀一次 IndexedDB 好貴。 */
export function getStopMap(): Promise<Map<string, Stop>> {
  if (!stopMapP) {
    stopMapP = (async () => {
      const hit = await cacheGet<Stop[]>(STOPS_KEY, STOPS_MAX_AGE)
      if (hit?.data.length) {
        if (hit.age > STOPS_FRESH) refreshStops()
        return toMap(hit.data)
      }
      let stops: Stop[]
      try {
        stops = (await fetchStops()).map(slim)
      } catch {
        stopMapP = null // 下次再試
        return new Map<string, Stop>()
      }
      if (stops.length > 0) void cachePut(STOPS_KEY, stops)
      else stopMapP = null // 唔好快取空陣列(記憶體都唔好)
      return toMap(stops)
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
  // 同 key 多條時分得開(GMB gtfsId / 嶼巴 nlbUid);舊收藏冇,靠 dest + stopId 對返。唔入 favKey,舊星照對到
  uid?: string
  // 行去呢個站要幾多分鐘(1–30;冇 = 未設定)。跟收藏一齊入備份;唔入 favKey
  walkMins?: number
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

/** 收藏加減 / 次序變咗 → 通知首頁收藏列表重讀 */
export const FAVS_CHANGED = 'kkcx:favs-changed'

/** 收藏排序:將第 idx 項上/下移一格(顯示模式 + 首頁同一次序) */
export function moveFavorite(idx: number, dir: -1 | 1): Favorite[] {
  const list = getFavorites()
  const j = idx + dir
  if (idx < 0 || idx >= list.length || j < 0 || j >= list.length) return list
  ;[list[idx], list[j]] = [list[j], list[idx]]
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(list))
  } catch {
    // 存唔到都回傳記憶體版本
  }
  window.dispatchEvent(new Event(FAVS_CHANGED))
  return list
}

/** 設定 / 清除(null、0)某個收藏嘅步行時間:原地改,次序不變;搵唔到就原封不動 */
export function setFavoriteWalk(key: string, mins: number | null): Favorite[] {
  const list = getFavorites()
  const idx = list.findIndex((x) => favKey(x) === key)
  if (idx < 0) return list
  const next = { ...list[idx] }
  const m = validWalk(mins)
  if (m) next.walkMins = m
  else delete next.walkMins
  list[idx] = next
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(list))
  } catch {
    // 存唔到都回傳記憶體版本
  }
  window.dispatchEvent(new Event(FAVS_CHANGED))
  return list
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
  // 首頁要知(例如刪咗最後一個收藏 → 轉返大熊貓 hero)
  window.dispatchEvent(new Event(FAVS_CHANGED))
  return list
}
