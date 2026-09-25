// 收藏 → Route / ETA 分鐘:以前 Favorites、DisplayMode、ClockPush 各自抄一份,已經開始唔一致。
import type { Eta, Route } from '../api/bus'
import type { Favorite } from './store'
import { minutesUntil } from './time'

export const favToRoute = (f: Favorite): Route => ({
  co: f.co,
  route: f.route,
  bound: f.bound,
  service_type: f.serviceType,
  orig_tc: '',
  dest_tc: f.dest,
  // 新收藏有 uid:getEta 直接用返嗰條 GMB routeId / 嶼巴變體;舊收藏冇就靠 dest + stopId
  uid: f.uid,
})

/** ETA 列表 → 未來幾班嘅分鐘數(由細到大;冇時間嘅班次唔計;已過超過 1 分鐘嘅都唔計) */
export function etaMinutes(etas: Eta[], now: number = Date.now(), max = 3): number[] {
  return etas
    .map((e) => minutesUntil(e.eta, now))
    .filter((m): m is number => m != null && m >= -1)
    .sort((a, b) => a - b)
    .slice(0, max)
}
