import { useCallback, useEffect, useState } from 'react'
import { fetchSchedule, type StationSchedule, type TrainArrival } from '../api/mtr'
import { stationNameTc } from '../lib/mtrData'

const REFRESH_MS = 15_000

function ttntLabel(t: number): string {
  if (t <= 0) return '即將抵達'
  return `${t} 分鐘`
}

function Direction({ title, trains, color }: { title: string; trains: TrainArrival[]; color: string }) {
  if (trains.length === 0) return null
  const dest = stationNameTc[trains[0].dest] ?? trains[0].dest
  return (
    <div className="mtr-dir">
      <div className="mtr-dir-head" style={{ borderColor: color }}>
        {title} <span className="mtr-dest">往 {dest}</span>
      </div>
      <ul className="mtr-trains">
        {trains.slice(0, 4).map((t, i) => (
          <li key={i} className="mtr-train">
            <span className={`mtr-mins ${t.ttnt <= 1 ? 'soon' : ''}`}>{ttntLabel(t.ttnt)}</span>
            {t.plat && <span className="mtr-plat">月台 {t.plat}</span>}
            {stationNameTc[t.dest] && i > 0 && <span className="muted small">往 {stationNameTc[t.dest]}</span>}
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

  const load = useCallback(async () => {
    try {
      setError(null)
      setSched(await fetchSchedule(line, station))
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [line, station])

  useEffect(() => {
    setLoading(true)
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  if (loading) return <div className="muted pad">載入班次…</div>
  if (error) return <div className="error pad">⚠️ {error}</div>
  if (!sched) return null

  if (sched.special) {
    return (
      <div className="mtr-special">
        ⚠️ {sched.message || '車務有特別安排,暫無實時班次。請留意港鐵公佈。'}
      </div>
    )
  }

  const empty = sched.up.length === 0 && sched.down.length === 0
  return (
    <div className="mtr-sched">
      {sched.isDelay && <div className="mtr-delay">⚠️ 服務延誤</div>}
      {empty && <div className="muted pad">此站暫無班次(可能為總站方向)</div>}
      <Direction title="↑" trains={sched.up} color={color} />
      <Direction title="↓" trains={sched.down} color={color} />
      <div className="eta-updated muted">每 15 秒自動刷新 · 資料 © 港鐵公司 / data.gov.hk</div>
    </div>
  )
}
