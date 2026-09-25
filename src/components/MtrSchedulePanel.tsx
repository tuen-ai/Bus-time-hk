import { useEffect, useRef, useState } from 'react'
import { fetchSchedule, type StationSchedule, type TrainArrival } from '../api/mtr'
import { stationNameTc } from '../lib/mtrData'
import { usePolling } from '../hooks/usePolling'
import { friendlyError } from '../lib/http'

const REFRESH_MS = 15_000

function ttntLabel(t: number): string {
  if (t <= 0) return '即將抵達'
  return `${t} 分鐘`
}

function Direction({ trains, color }: { trains: TrainArrival[]; color: string }) {
  if (trains.length === 0) return null
  const dest = stationNameTc[trains[0].dest] ?? trains[0].dest
  return (
    <div className="mtr-dir">
      <div className="mtr-dir-head" style={{ borderColor: color }}>
        往 <span className="mtr-dest-name">{dest}</span>
      </div>
      <ul className="mtr-trains">
        {trains.slice(0, 4).map((t, i) => (
          <li key={`${t.dest}-${t.ttnt}-${t.plat}-${i}`} className="mtr-train">
            <span className={`mtr-mins ${t.ttnt <= 1 ? 'soon' : ''}`}>{ttntLabel(t.ttnt)}</span>
            {t.plat && <span className="mtr-plat">月台 {t.plat}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function MtrSchedulePanel({
  line,
  station,
  color,
}: {
  line: string
  station: string
  color: string
}) {
  const [sched, setSched] = useState<StationSchedule | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 換站就 abort 舊請求 + 清走舊站班次,免舊站資料蓋過(或者扮做)新站
  const ctrlRef = useRef<AbortController | null>(null)
  useEffect(() => {
    setLoading(true)
    setSched(null)
    setError(null)
    return () => ctrlRef.current?.abort()
  }, [line, station])

  usePolling(
    async () => {
      ctrlRef.current?.abort()
      const ctrl = (ctrlRef.current = new AbortController())
      try {
        const s = await fetchSchedule(line, station, ctrl.signal)
        if (ctrl.signal.aborted) return
        setSched(s)
        setError(null)
      } catch (e) {
        if (ctrl.signal.aborted || (e as Error)?.name === 'AbortError') return
        // 英文原文(HTTP 500 / signal timed out)唔好直出,轉做廣東話;自己拋嘅中文訊息照出
        setError(friendlyError(e))
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    },
    REFRESH_MS,
    { key: `${line}|${station}` },
  )

  if (loading) return <div className="muted pad">載入班次…</div>
  // 從未攞到先成個出錯;有上次資料就照顯示,一次 15 秒 tick 失敗唔好洗走成個時間表
  if (!sched)
    return error ? (
      <div className="error pad">
        <span aria-hidden="true">⚠️ </span>
        {error}(15 秒後自動再試)
      </div>
    ) : null
  const staleNote = error && (
    <div className="muted small">
      <span aria-hidden="true">📶 </span>網絡唔穩 · 顯示緊上次資料 · 重試中
    </div>
  )

  if (sched.special) {
    return (
      <>
        <div className="mtr-special">
          <span aria-hidden="true">⚠️ </span>
          {sched.message || '車務有特別安排,暫無實時班次。'}
          {sched.url && (
            <>
              {' '}
              <a href={sched.url} target="_blank" rel="noreferrer">
                查看車務通告 ›
              </a>
            </>
          )}
        </div>
        {staleNote}
      </>
    )
  }

  const empty = sched.up.length === 0 && sched.down.length === 0
  return (
    <div className="mtr-sched">
      {staleNote}
      {sched.isDelay && (
        <div className="mtr-delay">
          <span aria-hidden="true">⚠️ </span>服務延誤
        </div>
      )}
      {empty && <div className="muted pad">此站暫無班次(可能為總站方向)</div>}
      <Direction trains={sched.up} color={color} />
      <Direction trains={sched.down} color={color} />
      <div className="eta-updated muted">每 15 秒自動刷新 · 資料 © 港鐵公司 / data.gov.hk</div>
    </div>
  )
}
