// 底部浮動提示條:出門倒數 + 落車鬧鐘(全 app 常駐,唔會因轉 tab 唔見)。
import { useEffect, useState } from 'react'
import { getReminder, setReminder, subscribeReminder, fmtClock, type LeaveReminder } from '../lib/reminder'
import { getAlarm, stopAlarm, subscribeAlarm, type AlightAlarm } from '../lib/alarm'
import { alertAll, formatCountdown } from '../lib/chime'
import { formatDistance } from '../lib/geo'

export default function AlertBanners() {
  const [reminder, setR] = useState<LeaveReminder | null>(getReminder)
  const [alarm, setA] = useState<AlightAlarm | null>(getAlarm)
  const [now, setNow] = useState(() => Date.now())
  const [leaveFired, setLeaveFired] = useState(false)

  useEffect(() => subscribeReminder(setR), [])
  useEffect(() => subscribeAlarm(setA), [])

  // 每秒 tick(有嘢先 tick)
  useEffect(() => {
    if (!reminder && !alarm) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [reminder, alarm])

  // 夠鐘出門 → 響一次
  useEffect(() => {
    if (!reminder) {
      setLeaveFired(false)
      return
    }
    if (!leaveFired && now >= reminder.at) {
      setLeaveFired(true)
      alertAll(
        '🏃 夠鐘出門喇!',
        `去「${reminder.destLabel}」要 ${reminder.journeyMins} 分鐘,而家出發先趕到 ${reminder.arriveBy}~`,
      )
    }
  }, [now, reminder, leaveFired])

  if (!reminder && !alarm) return null

  return (
    <>
      {/* fixed banner 出咗 flow —— 用 spacer 頂住,免遮住頁尾內容 */}
      <div className="banners-spacer" aria-hidden="true" />
      <div className="banners">
        {reminder && (
          <div className={`fbanner ${now >= reminder.at ? 'urgent' : ''}`}>
            <span className="fb-icon">{now >= reminder.at ? '🏃' : '⏰'}</span>
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
            <span className="fb-icon">🔔</span>
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
