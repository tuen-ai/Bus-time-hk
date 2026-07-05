// 的士車費估算(2024-07 起市區紅的收費):
// 首 2 公里 $29;其後每 200 米 $2.1;錶過 $102.5 後每 200 米 $1.4。
// 只計行車距離(直線 × 1.4 路面係數),隧道費/行李/等候未計 —— 僅供參考。
import { distanceMeters } from './geo'

const FLAGFALL = 29 // 首 2km
const RATE_1 = 2.1 // 每 200m
const RATE_2 = 1.4 // 錶過 $102.5 之後
const SWITCH_AT = 102.5
const ROAD_FACTOR = 1.4 // 直線 → 路面距離估算

export function taxiFareEstimate(
  o: { lat: number; lng: number },
  d: { lat: number; lng: number },
): { fare: number; km: number } | null {
  const straight = distanceMeters(o.lat, o.lng, d.lat, d.lng)
  if (!isFinite(straight) || straight < 100) return null
  const m = straight * ROAD_FACTOR
  let fare = FLAGFALL
  let rest = Math.max(0, m - 2000)
  while (rest > 0) {
    fare += fare < SWITCH_AT ? RATE_1 : RATE_2
    rest -= 200
  }
  return { fare: Math.round(fare), km: Math.round(m / 100) / 10 }
}
