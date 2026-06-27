import { useEffect, useMemo, useState } from 'react'
import type { Route } from './api/kmb'
import { getRoutes } from './lib/store'
import Favorites from './components/Favorites'
import RouteStopsView from './components/RouteStopsView'
import NearbyView from './components/NearbyView'

type Tab = 'search' | 'nearby'

export default function App() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Route | null>(null)
  const [tab, setTab] = useState<Tab>('search')
  const [dark, setDark] = useState(() => localStorage.getItem('kmb.theme') === 'dark')

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('kmb.theme', dark ? 'dark' : 'light')
  }, [dark])

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
        <div className="topbar-row">
          <h1 onClick={() => { setSelected(null); setTab('search') }}>🚌 九巴到站時間</h1>
          <button
            className="theme-toggle"
            onClick={() => setDark((d) => !d)}
            aria-label="切換深色模式"
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
        <span className="topbar-sub">KMB · LWB 實時 ETA</span>
      </header>

      {!selected && (
        <nav className="tabs">
          <button
            className={tab === 'search' ? 'tab on' : 'tab'}
            onClick={() => setTab('search')}
          >
            🔍 搜尋路線
          </button>
          <button
            className={tab === 'nearby' ? 'tab on' : 'tab'}
            onClick={() => setTab('nearby')}
          >
            📍 附近車站
          </button>
        </nav>
      )}

      <main className="content">
        {selected ? (
          <RouteStopsView
            route={selected}
            variants={routes.filter((r) => r.route === selected.route)}
            onSwitch={setSelected}
            onBack={() => setSelected(null)}
          />
        ) : tab === 'nearby' ? (
          <NearbyView />
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
        到站資料:運輸署 / 九巴 ·{' '}
        <a href="https://data.gov.hk/tc-data/dataset/hk-td-tis_21-etakmb" target="_blank" rel="noreferrer">
          data.gov.hk
        </a>
        <br />
        路線形狀:{' '}
        <a href="https://github.com/hkbus/hk-bus-crawling" target="_blank" rel="noreferrer">
          HK Bus Crawling
        </a>{' '}
        (GPL-2.0) · 地圖 © OpenStreetMap contributors
      </footer>
    </div>
  )
}
