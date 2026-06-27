import { useCallback, useEffect, useState } from 'react'
import { fetchEta, type Eta } from '../api/kmb'
import { clockLabel, etaLabel } from '../lib/time'

const REFRESH_MS = 30_000

interface Props {
  stopId: string
  route: string
  serviceType: string
}

export default function EtaPanel({ stopId, route, serviceType }: Props) {
  const [etas, setEtas] = useState<Eta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchEta(stopId, route, serviceType)
      // 只保留同方向、未來班次,按 eta_seq 排序
      const sorted = [...data].sort((a, b) => a.eta_seq - b.eta_seq).slice(0, 3)
      setEtas(sorted)
      setUpdatedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [stopId, route, serviceType])

  useEffect(() => {
    setLoading(true)
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  if (loading) return <div className="eta-panel muted">載入到站時間…</div>
  if (error) return <div className="eta-panel error">⚠️ {error}</div>

  const hasAny = etas.some((e) => e.eta)

  return (
    <div className="eta-panel">
      {!hasAny && <div className="muted">暫無預計班次</div>}
      {hasAny && (
        <ul className="eta-list">
          {etas.map((e, i) => (
            <li key={i} className="eta-row">
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
          最後更新 {clockLabel(new Date(updatedAt).toISOString())} · 每 30 秒自動刷新
        </div>
      )}
    </div>
  )
}

function etaIsSoon(eta: string | null): boolean {
  if (!eta) return false
  return new Date(eta).getTime() - Date.now() <= 3 * 60_000
}
