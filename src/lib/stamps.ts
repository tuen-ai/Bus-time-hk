// 熊貓儲印仔:每日用過 app(睇 ETA / 規劃行程)就儲一個印,
// 儲夠里程碑解鎖公仔造型。純 localStorage。
export interface Stamps {
  days: string[] // 'YYYY-MM-DD',升序,cap 400
  total: number
}

const KEY = 'kkcx.stamps'

export const MILESTONES = [
  { at: 3, id: 'bow', label: '蝴蝶結熊貓', emoji: '🎀' },
  { at: 7, id: 'star', label: '星星眼熊貓', emoji: '✨' },
  { at: 14, id: 'knight', label: '太空騎士熊', emoji: '⚔️' },
  { at: 30, id: 'gold', label: '金牌熊貓', emoji: '🏅' },
] as const

export function getStamps(): Stamps {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Stamps | null
    if (s && Array.isArray(s.days)) return s
  } catch {
    /* fallthrough */
  }
  return { days: [], total: 0 }
}

const dayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 今日儲一個印(一日一個)。回傳 true = 新印(可以彈祝賀)。 */
export function addStamp(): boolean {
  try {
    const s = getStamps()
    const today = dayStr()
    if (s.days.includes(today)) return false
    s.days = [...s.days, today].slice(-400)
    s.total += 1
    localStorage.setItem(KEY, JSON.stringify(s))
    return true
  } catch {
    return false
  }
}

/** 已解鎖嘅里程碑 id */
export function unlocked(s = getStamps()): string[] {
  return MILESTONES.filter((m) => s.total >= m.at).map((m) => m.id)
}

/** 下一個里程碑(全部解鎖晒就 null) */
export function nextMilestone(s = getStamps()) {
  return MILESTONES.find((m) => s.total < m.at) ?? null
}
