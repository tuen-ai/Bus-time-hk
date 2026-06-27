import districts from '../data/hkDistricts.json'
import { distanceMeters } from './geo'

/** 由座標搵最近嘅 HKO 分區名 */
export function nearestDistrict(lat: number, lng: number): string {
  let best = districts[0]
  let bestD = Infinity
  for (const d of districts) {
    const dist = distanceMeters(lat, lng, d.lat, d.lng)
    if (dist < bestD) {
      bestD = dist
      best = d
    }
  }
  return best.name
}

export type RainLevel = 'none' | 'light' | 'moderate' | 'heavy'

/** 過去一小時雨量(mm)→ 等級 */
export function rainLevel(mm: number): RainLevel {
  if (mm <= 0.2) return 'none'
  if (mm < 5) return 'light'
  if (mm < 15) return 'moderate'
  return 'heavy'
}

export const rainLabel: Record<RainLevel, string> = {
  none: '無雨',
  light: '微雨',
  moderate: '中雨',
  heavy: '大雨',
}
