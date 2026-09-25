// 出門提醒(逆向倒數):localStorage 持久 + 訂閱式小 store。
// ⚠️ 純前端 —— 提醒只喺 app 開住(前台/背景分頁)時生效。
import { lsDel, lsGet, lsSet } from './ls'

export interface LeaveReminder {
  at: number // 最遲出門時刻(epoch ms)
  destLabel: string // 目的地描述
  journeyMins: number // 全程估算
  arriveBy: string // "HH:MM"
  fired?: boolean // 已經響過(reload 唔再響)
}

const KEY = 'kkcx.leaveReminder'
type Listener = (r: LeaveReminder | null) => void
const listeners = new Set<Listener>()

export function getReminder(): LeaveReminder | null {
  const raw = lsGet(KEY)
  if (!raw) return null
  try {
    const r = JSON.parse(raw) as LeaveReminder | null
    if (typeof r?.at !== 'number') return null
    // 過咗成個鐘就自動棄掉
    if (Date.now() - r.at > 60 * 60 * 1000) {
      lsDel(KEY)
      return null
    }
    return r
  } catch {
    return null
  }
}

export function setReminder(r: LeaveReminder | null): void {
  // 私隱模式 / 爆 quota:唔持久化,但照通知 listeners
  if (r) lsSet(KEY, JSON.stringify(r))
  else lsDel(KEY)
  listeners.forEach((fn) => fn(r))
}

/** 夠鐘而又未響過 → 要響。新設嘅提醒冇 fired,所以一定會再響(唔會被上一個食咗) */
export function reminderDue(r: LeaveReminder | null, now: number): r is LeaveReminder {
  return !!r && !r.fired && now >= r.at
}

export function subscribeReminder(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 由「幾點前要到」計最遲出門時刻。arriveBy "HH:MM"(今日,過咗當聽日)。 */
export function leaveAtFor(arriveBy: string, journeyMins: number, bufferMins = 2): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(arriveBy)
  if (!m) return null
  const d = new Date()
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1) // 已過 → 聽日
  return d.getTime() - (journeyMins + bufferMins) * 60 * 1000
}

export const fmtClock = (t: number): string =>
  new Date(t).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })
