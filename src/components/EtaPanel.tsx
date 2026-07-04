import { useCallback, useEffect, useState } from 'react'
import { getEta, type Eta, type Route } from '../api/bus'
import { clockLabel, etaLabel } from '../lib/time'
import { speak, speechSupported } from '../lib/speech'

const REFRESH_MS = 5_000

interface Props {
  route: Route
  stopId: string
}

export default function EtaPanel({ route, stopId }: Props) {
  const [etas, setEtas] = useState<Eta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const data = await getEta(route, stopId)
      // 按 eta_seq 排序,取未來 3 班
      const sorted = [...data].sort((a, b) => a.eta_seq - b.eta_seq).slice(0, 3)
      setEtas(sorted)
      setUpdatedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [route, stopId])

  useEffect(() => {
    setLoading(true)
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  if (loading) return <div className="eta-panel muted">載入到站時間…</div>
  if (error) return <div className="eta-panel error">⚠️ {error}</div>

  const hasAny = etas.some((e) => e.eta)

  // 讀出下一班(眼唔使盯住 mon,兼顧無障礙)
  const speakEta = () => {
    const mins = etas
      .filter((e) => e.eta)
      .map((e) => Math.round((new Date(e.eta!).getTime() - Date.now()) / 60000))
    if (!mins.length) {
      speak(`${route.route} 往 ${route.dest_tc},暫時冇預計班次`)
      return
    }
    const first = mins[0] <= 0 ? '即將到站' : `下一班仲有 ${mins[0]} 分鐘`
    const next = mins.length > 1 && mins[1] > 0 ? `,之後嗰班 ${mins[1]} 分鐘` : ''
    speak(`${route.route} 往 ${route.dest_tc},${first}${next}`)
  }

  return (
    <div className="eta-panel">
      {!hasAny && <div className="muted">暫無預計班次</div>}
      {hasAny && (
        <ul className="eta-list">
          {etas.map((e, i) => (
            <li key={`${e.eta ?? 'na'}-${e.eta_seq}-${i}`} className="eta-row">
              <span className={`eta-mins ${etaIsSoon(e.eta) ? 'soon' : ''}`}>
                {etaLabel(e.eta)}
              </span>
              <span className="eta-clock">{clockLabel(e.eta)}</span>
              {e.rmk_tc && <span className="eta-rmk">{e.rmk_tc}</span>}
            </li>
          ))}
        </ul>
      )}
      {updatedAt && (
        <div className="eta-updated muted">
          最後更新 {clockLabel(new Date(updatedAt).toISOString())} · 每 5 秒自動刷新
          <button className="refresh-btn" onClick={load} aria-label="立即刷新">
            ↻ 刷新
          </button>
          {speechSupported && (
            <button className="refresh-btn" onClick={speakEta} aria-label="讀出到站時間">
              🔊 讀出
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function etaIsSoon(eta: string | null): boolean {
  if (!eta) return false
  return new Date(eta).getTime() - Date.now() <= 3 * 60_000
}
