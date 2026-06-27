import { useCallback, useEffect, useState } from 'react'
import { fetchStopEta, type Eta } from '../api/kmb'
import { etaLabel, minutesUntil } from '../lib/time'

const REFRESH_MS = 5_000

interface Group {
  key: string
  route: string
  dest: string
  etas: (string | null)[]
  rmk: string
  soonest: number
}

function group(etas: Eta[]): Group[] {
  const map = new Map<string, Group>()
  for (const e of etas) {
    const key = `${e.route}|${e.dir}|${e.service_type}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        route: e.route,
        dest: e.dest_tc,
        etas: [],
        rmk: e.rmk_tc,
        soonest: Number.POSITIVE_INFINITY,
      })
    }
    const g = map.get(key)!
    g.etas.push(e.eta)
    const mins = minutesUntil(e.eta)
    if (mins !== null && mins < g.soonest) g.soonest = mins
  }
  return [...map.values()]
    .map((g) => ({ ...g, etas: g.etas.slice(0, 3) }))
    .sort(
      (a, b) =>
        a.soonest - b.soonest ||
        a.route.localeCompare(b.route, undefined, { numeric: true }),
    )
}

export default function StopEtaPanel({ stopId }: { stopId: string }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setGroups(group(await fetchStopEta(stopId)))
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [stopId])

  useEffect(() => {
    setLoading(true)
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  if (loading) return <div className="eta-panel muted">載入到站時間…</div>
  if (error) return <div className="eta-panel error">⚠️ {error}</div>
  if (groups.length === 0) return <div className="eta-panel muted">暫無班次</div>

  return (
    <div className="stop-eta-panel">
      {groups.map((g) => (
        <div key={g.key} className="stop-eta-row">
          <span className="route-badge sm">{g.route}</span>
          <div className="stop-eta-info">
            <div className="stop-eta-dest">往 {g.dest}</div>
            <div className="stop-eta-times">
              {g.etas.map((eta, i) => (
                <span key={i} className={`pill ${i === 0 ? 'first' : ''}`}>
                  {etaLabel(eta)}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
