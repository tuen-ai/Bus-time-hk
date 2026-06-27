import { useEffect, useState } from 'react'
import { fetchSchedule, type StationSchedule, type TrainArrival } from '../api/mtr'
import { stationNameTc } from '../lib/mtrData'

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

  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()
    const load = async () => {
      try {
        const s = await fetchSchedule(line, station, ctrl.signal)
        if (alive) {
          setSched(s)
          setError(null)
        }
      } catch (e) {
        if (alive && (e as Error)?.name !== 'AbortError') {
          setError(e instanceof Error ? e.message : '載入失敗')
        }
      } finally {
        if (alive) setLoading(false)
      }
    }
    setLoading(true)
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      ctrl.abort()
      clearInterval(id)
    }
  }, [line, station])

  if (loading) return <div className="muted pad">載入班次…</div>
  if (error) return <div className="error pad">⚠️ {error}</div>
  if (!sched) return null

  if (sched.special) {
    return (
      <div className="mtr-special">
        ⚠️ {sched.message || '車務有特別安排,暫無實時班次。'}
        {sched.url && (
          <>
            {' '}
            <a href={sched.url} target="_blank" rel="noreferrer">
              查看車務通告 ›
            </a>
          </>
        )}
      </div>
    )
  }

  const empty = sched.up.length === 0 && sched.down.length === 0
  return (
    <div className="mtr-sched">
      {sched.isDelay && <div className="mtr-delay">⚠️ 服務延誤</div>}
      {empty && <div className="muted pad">此站暫無班次(可能為總站方向)</div>}
      <Direction trains={sched.up} color={color} />
      <Direction trains={sched.down} color={color} />
      <div className="eta-updated muted">每 15 秒自動刷新 · 資料 © 港鐵公司 / data.gov.hk</div>
    </div>
  )
}
