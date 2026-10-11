import { useEffect, useState } from 'react'
import { formatHkClock } from '../lib/hkClock'

/** 下一秒整之前要等幾耐(+15ms 緩衝,免得 timer 早少少醒咗仲係舊嗰秒) */
const msToNextSecond = () => 1000 - (Date.now() % 1000) + 15

/**
 * 首頁頂欄嘅實時香港時間(HH:MM:SS + 日期)。
 * 自己一個 component 每秒 re-render,唔會連累成個 App;
 * 分頁收埋(document.hidden)就停 timer,返嚟即刻對返啱嘅時間。
 * 無障礙:role="timer" + aria-live="off",讀屏唔會每秒讀一次。
 */
export default function LiveClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let t: number | undefined
    const tick = () => {
      setNow(new Date())
      t = window.setTimeout(tick, msToNextSecond())
    }
    const start = () => {
      window.clearTimeout(t)
      if (document.hidden) return
      tick()
    }
    start()
    document.addEventListener('visibilitychange', start)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('visibilitychange', start)
    }
  }, [])

  const { time, date, iso } = formatHkClock(now)
  return (
    <div className="live-clock" role="timer" aria-live="off" aria-label="香港時間">
      <time dateTime={iso}>
        <span className="live-clock-time">{time}</span>
        <span className="live-clock-date">{date}</span>
      </time>
    </div>
  )
}
