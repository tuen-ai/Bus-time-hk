import { useEffect, useMemo, useState } from 'react'
import type { Route } from './api/kmb'
import { getRoutes } from './lib/store'
import Favorites from './components/Favorites'
import RouteStopsView from './components/RouteStopsView'

export default function App() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Route | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        setRoutes(await getRoutes())
      } catch (e) {
        setError(e instanceof Error ? e.message : '無法載入路線資料')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return []
    return routes
      .filter((r) => r.route.toUpperCase().startsWith(q))
      .sort((a, b) =>
        a.route.localeCompare(b.route, undefined, { numeric: true }) ||
        a.bound.localeCompare(b.bound) ||
        a.service_type.localeCompare(b.service_type),
      )
      .slice(0, 60)
  }, [routes, query])

  return (
    <div className="app">
      <header className="topbar">
        <h1 onClick={() => setSelected(null)}>🚌 九巴到站時間</h1>
        <span className="topbar-sub">KMB · LWB 實時 ETA</span>
      </header>

      <main className="content">
        {selected ? (
          <RouteStopsView route={selected} onBack={() => setSelected(null)} />
        ) : (
          <>
            <div className="search">
              <input
                inputMode="text"
                autoFocus
                placeholder="輸入路線號碼,例如 1A、269D、N269"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button className="clear" onClick={() => setQuery('')} aria-label="清除">
                  ✕
                </button>
              )}
            </div>

            {loading && <div className="muted pad">載入路線資料…</div>}
            {error && <div className="error pad">⚠️ {error}</div>}

            {!query && !loading && <Favorites />}

            {query && matches.length === 0 && !loading && (
              <div className="muted pad">搵唔到路線「{query}」</div>
            )}

            <div className="route-results">
              {matches.map((r) => (
                <button
                  key={`${r.route}|${r.bound}|${r.service_type}`}
                  className="route-card"
                  onClick={() => setSelected(r)}
                >
                  <span className="route-badge">{r.route}</span>
                  <span className="route-line">
                    <span className="muted small">往</span> {r.dest_tc}
                    <span className="muted small ml"> 由 {r.orig_tc}</span>
                  </span>
                  <span className="chev">›</span>
                </button>
              ))}
            </div>
          </>
        )}
      </main>

      <footer className="footer">
        資料來源:運輸署 / 九巴 ·{' '}
        <a href="https://data.gov.hk/tc-data/dataset/hk-td-tis_21-etakmb" target="_blank" rel="noreferrer">
          data.gov.hk
        </a>
      </footer>
    </div>
  )
}
