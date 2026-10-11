// 香港時間(Asia/Hong_Kong)格式化:用 Intl 計,唔靠部機自己嘅時區設定
const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Hong_Kong',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

// 星期用英文縮寫對返中文,唔同瀏覽器 ICU 版本出嘅中文星期寫法唔一(週日 / 星期日 / 日)
const WEEKDAY: Record<string, string> = {
  Sun: '日',
  Mon: '一',
  Tue: '二',
  Wed: '三',
  Thu: '四',
  Fri: '五',
  Sat: '六',
}

export interface HkClock {
  /** HH:MM:SS(24 小時) */
  time: string
  /** 例:10月11日 (日) */
  date: string
  /** <time dateTime>:2026-10-11T23:05:09+08:00 */
  iso: string
}

export function formatHkClock(d: Date): HkClock {
  const p: Record<string, string> = {}
  for (const { type, value } of PARTS.formatToParts(d)) p[type] = value
  // 舊 Chrome 喺 h23 邊界有機會出 "24",保險起見轉返 00
  const hh = p.hour === '24' ? '00' : p.hour
  const time = `${hh}:${p.minute}:${p.second}`
  const date = `${Number(p.month)}月${Number(p.day)}日 (${WEEKDAY[p.weekday] ?? p.weekday})`
  const pad = (s: string) => s.padStart(2, '0')
  const iso = `${p.year}-${pad(p.month)}-${pad(p.day)}T${time}+08:00`
  return { time, date, iso }
}
