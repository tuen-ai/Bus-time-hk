// 底部浮動提示條:出門倒數 + 落車鬧鐘(全 app 常駐,唔會因轉 tab 唔見)。
import { useEffect, useRef, useState } from 'react'
import {
  getReminder,
  setReminder,
  subscribeReminder,
  reminderDue,
  fmtClock,
  type LeaveReminder,
} from '../lib/reminder'
import { getAlarm, stopAlarm, subscribeAlarm, type AlightAlarm } from '../lib/alarm'
import { alertAll, formatCountdown } from '../lib/chime'
import { formatDistance } from '../lib/geo'

export default function AlertBanners() {
  const [reminder, setR] = useState<LeaveReminder | null>(getReminder)
  const [alarm, setA] = useState<AlightAlarm | null>(getAlarm)
  const [now, setNow] = useState(() => Date.now())
  // 呢個 session 響過邊個(用 at 認);StrictMode 重跑 effect 都唔會響兩次
  const firedAt = useRef<number | null>(null)

  useEffect(() => subscribeReminder(setR), [])
  useEffect(() => subscribeAlarm(setA), [])

  // 每秒 tick(有嘢先 tick)
  useEffect(() => {
    if (!reminder && !alarm) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [reminder, alarm])

  // 夠鐘出門 → 每個提醒響一次。fired 寫返入 store:換過新提醒會再響,reload 唔會重響舊嗰個
  useEffect(() => {
    if (!reminderDue(reminder, now) || firedAt.current === reminder.at) return
    firedAt.current = reminder.at
    // 先響,再持久化(storage 出錯都唔會食咗個提醒)
    alertAll(
      '🏃 夠鐘出門喇!',
      `去「${reminder.destLabel}」要 ${reminder.journeyMins} 分鐘,而家出發先趕到 ${reminder.arriveBy}~`,
    )
    setReminder({ ...reminder, fired: true })
  }, [now, reminder])

  if (!reminder && !alarm) return null

  return (
    <>
      {/* fixed banner 出咗 flow —— 用 spacer 頂住,免遮住頁尾內容 */}
      <div className="banners-spacer" aria-hidden="true" />
      <div className="banners">
        {reminder && (
          <div className={`fbanner ${now >= reminder.at ? 'urgent' : ''}`}>
            <span className="fb-icon" aria-hidden="true">
              {now >= reminder.at ? '🏃' : '⏰'}
            </span>
            <span className="fb-text">
              {now >= reminder.at ? (
                <>
                  夠鐘出門喇!要 {reminder.arriveBy} 前到「{reminder.destLabel}」
                </>
              ) : (
                <>
                  {fmtClock(reminder.at)} 出門 → {reminder.arriveBy} 到「{reminder.destLabel}」
                  <b className="fb-count"> 剩 {formatCountdown(reminder.at - now)}</b>
                </>
              )}
            </span>
            <button className="fb-x" onClick={() => setReminder(null)} aria-label="取消出門提醒">
              ✕
            </button>
          </div>
        )}
        {alarm && (
          <div className={`fbanner ${alarm.fired ? 'urgent' : ''}`}>
            <span className="fb-icon" aria-hidden="true">
              🔔
            </span>
            <span className="fb-text">
              {alarm.fired ? (
                <>就快到「{alarm.stopName}」,準備落車!</>
              ) : alarm.geoError ? (
                <>
                  落車提醒({alarm.stopName}):⚠️ {alarm.geoError}
                </>
              ) : (
                <>
                  {alarm.routeLabel} · 到「{alarm.stopName}」嗌你
                  {alarm.dist != null && <b className="fb-count"> 距離 {formatDistance(alarm.dist)}</b>}
                  {alarm.dist == null && <span className="muted"> 定位中…</span>}
                </>
              )}
            </span>
            <button className="fb-x" onClick={stopAlarm} aria-label="取消落車提醒">
              ✕
            </button>
          </div>
        )}
      </div>
    </>
  )
}
