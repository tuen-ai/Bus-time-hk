// 出門提醒(逆向倒數):localStorage 持久 + 訂閱式小 store。
// ⚠️ 純前端 —— 提醒只喺 app 開住(前台/背景分頁)時生效。
export interface LeaveReminder {
  at: number // 最遲出門時刻(epoch ms)
  destLabel: string // 目的地描述
  journeyMins: number // 全程估算
  arriveBy: string // "HH:MM"
}

const KEY = 'kkcx.leaveReminder'
type Listener = (r: LeaveReminder | null) => void
const listeners = new Set<Listener>()

export function getReminder(): LeaveReminder | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const r = JSON.parse(raw) as LeaveReminder
    // 過咗成個鐘就自動棄掉
    if (Date.now() - r.at > 60 * 60 * 1000) {
      localStorage.removeItem(KEY)
      return null
    }
    return r
  } catch {
    return null
  }
}

export function setReminder(r: LeaveReminder | null): void {
  if (r) localStorage.setItem(KEY, JSON.stringify(r))
  else localStorage.removeItem(KEY)
  listeners.forEach((fn) => fn(r))
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
