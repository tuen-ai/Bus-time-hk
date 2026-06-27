// 將特別交通消息按「地區」比對到一條路線(該路線途經區 ∩ 事故地區)。
import { nearestDistrict } from './weather'
import type { Notice } from '../api/stn'

const norm = (name: string): string => name.replace(/區$/, '').trim()

/** 一條路線途經嘅地區集合(用每站最近分區) */
export function routeDistricts(stops: { lat: number; lng: number }[]): Set<string> {
  const set = new Set<string>()
  for (const s of stops) {
    if (s.lat && s.lng) set.add(norm(nearestDistrict(s.lat, s.lng)))
  }
  return set
}

/** 篩出同路線途經區有交集嘅消息 */
export function relevantNotices(notices: Notice[], districts: Set<string>): Notice[] {
  if (districts.size === 0) return []
  return notices.filter((n) => n.districts.some((d) => districts.has(norm(d))))
}
