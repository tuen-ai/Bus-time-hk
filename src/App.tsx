import { useEffect, useMemo, useState } from 'react'
import { getAllRoutes, coLabel, type Route } from './api/bus'
import Favorites from './components/Favorites'
import RouteStopsView from './components/RouteStopsView'
import MtrView from './components/MtrView'
import WeatherBanner from './components/WeatherBanner'
import { routeBadges } from './lib/routeMeta'
import type { Favorite } from './lib/store'

type Tab = 'search' | 'mtr'

export default function App() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Route | null>(null)
  const [tab, setTab] = useState<Tab>('search')
  const [initialStop, setInitialStop] = useState<string | undefined>()
  const [dark, setDark] = useState(() => localStorage.getItem('kmb.theme') === 'dark')

  const openRoute = (r: Route, stopId?: string) => {
    setInitialStop(stopId)
    setSelected(r)
  }

  const openFavorite = (f: Favorite) => {
    const r = routes.find(
      (x) =>
        x.co === f.co &&
        x.route === f.route &&
        x.bound === f.bound &&
        x.service_type === f.serviceType,
    )
    if (r) {
      setTab('search')
      openRoute(r, f.stopId)
    }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('kmb.theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    ;(async () => {
      try {
        setRoutes(await getAllRoutes())
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
        a.co.localeCompare(b.co) ||
        a.bound.localeCompare(b.bound) ||
        a.service_type.localeCompare(b.service_type),
      )
      .slice(0, 80)
  }, [routes, query])

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <h1 onClick={() => { setSelected(null); setTab('search') }}>🚌 香港巴士到站</h1>
          <button
            className="theme-toggle"
            onClick={() => setDark((d) => !d)}
            aria-label="切換深色模式"
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
        <span className="topbar-sub">九巴 · 龍運 · 城巴 實時 ETA</span>
      </header>

      <WeatherBanner />

      {!selected && (
        <nav className="tabs">
          <button
            className={tab === 'search' ? 'tab on' : 'tab'}
            onClick={() => setTab('search')}
          >
            🔍 搜尋路線
          </button>
          <button
            className={tab === 'mtr' ? 'tab on' : 'tab'}
            onClick={() => setTab('mtr')}
          >
            🚇 鐵路
          </button>
        </nav>
      )}

      <main className="content">
        {selected ? (
          <RouteStopsView
            route={selected}
            variants={routes.filter((r) => r.route === selected.route)}
            initialOpenStop={initialStop}
            onSwitch={(r) => openRoute(r)}
            onBack={() => setSelected(null)}
          />
        ) : tab === 'mtr' ? (
          <MtrView />
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

            {!query && !loading && <Favorites onOpen={openFavorite} />}

            {query && matches.length === 0 && !loading && (
              <div className="muted pad">搵唔到路線「{query}」</div>
            )}

            <div className="route-results">
              {matches.map((r) => (
                <button
                  key={`${r.co}|${r.route}|${r.bound}|${r.service_type}`}
                  className="route-card"
                  onClick={() => openRoute(r)}
                >
                  <span className={`route-badge ${r.co === 'ctb' ? 'co-ctb' : ''}`}>{r.route}</span>
                  <span className="route-line">
                    <span className={`tag tag-co tag-${r.co}`}>{coLabel(r.co)}</span>
                    <span className="muted small"> 往</span> {r.dest_tc}
                    <span className="muted small ml"> 由 {r.orig_tc}</span>
                    {routeBadges(r.route, r.service_type).map((b) => (
                      <span key={b.kind} className={`tag tag-${b.kind}`}>
                        {b.label}
                      </span>
                    ))}
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
        <br />
        天氣:香港天文台 (HKO) · 港鐵下一班列車:© 港鐵公司 MTR · data.gov.hk
      </footer>
    </div>
  )
}
