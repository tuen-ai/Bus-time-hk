// 通勤習慣記錄(智能首頁用):純 localStorage,唔出街、唔上傳。
// 記低「幾時開過邊條線」,之後喺相似時段(平日/假日 + ±90分鐘)推薦返。
import type { Co } from '../api/bus'

export interface UseEntry {
  co: Co
  route: string
  bound: string
  serviceType: string
  stopId?: string
  dow: number // 0-6
  hour: number // 0-23(連分鐘化做小數,e.g. 8.5)
  ts: number
}

const KEY = 'kkcx.usage'
const CAP = 300 // ring buffer 上限

function load(): UseEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as UseEntry[]
  } catch {
    return []
  }
}

export function recordUse(e: Omit<UseEntry, 'dow' | 'hour' | 'ts'>): void {
  try {
    const now = new Date()
    const list = load()
    list.push({
      ...e,
      dow: now.getDay(),
      hour: now.getHours() + now.getMinutes() / 60,
      ts: Date.now(),
    })
    localStorage.setItem(KEY, JSON.stringify(list.slice(-CAP)))
  } catch {
    /* 記錄失敗唔阻主流程 */
  }
}

const isWeekend = (dow: number) => dow === 0 || dow === 6
/** 時鐘差(循環,e.g. 23:30 vs 00:30 = 1 小時) */
const hourDiff = (a: number, b: number) => {
  const d = Math.abs(a - b)
  return Math.min(d, 24 - d)
}

export interface Suggestion {
  co: Co
  route: string
  bound: string
  serviceType: string
  stopId?: string
  score: number
  hits: number
}

/** 依「而家係平日/假日 + 時段」推薦最常用路線(最多 top 3;少過 2 次唔推,免嘈) */
export function suggest(now = new Date()): Suggestion[] {
  const list = load()
  if (list.length < 3) return []
  const dowType = isWeekend(now.getDay())
  const h = now.getHours() + now.getMinutes() / 60
  const groups = new Map<string, Suggestion>()
  for (const e of list) {
    if (isWeekend(e.dow) !== dowType) continue
    if (hourDiff(e.hour, h) > 1.5) continue
    // 半年前嘅嘢權重趨零
    const age = (Date.now() - e.ts) / (180 * 24 * 3600 * 1000)
    const w = Math.max(0, 1 - age)
    const k = `${e.co}|${e.route}|${e.bound}|${e.serviceType}`
    const g = groups.get(k)
    if (g) {
      g.score += w
      g.hits += 1
      if (e.stopId) g.stopId = e.stopId // 用最近嗰個站
    } else {
      groups.set(k, { co: e.co, route: e.route, bound: e.bound, serviceType: e.serviceType, stopId: e.stopId, score: w, hits: 1 })
    }
  }
  return [...groups.values()]
    .filter((g) => g.hits >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}
