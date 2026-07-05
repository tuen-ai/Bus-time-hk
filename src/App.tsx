import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { getAllRoutes, coLabel, coClass, CO_COLOR, SEARCH_OPERATORS, type Route, type Co } from './api/bus'
import Favorites from './components/Favorites'
import RouteStopsView from './components/RouteStopsView'
import NearbyView from './components/NearbyView'

// 鐵路頁拉埋 Leaflet 落嚟 —— 揀咗先載,搜尋首屏輕好多
const MtrView = lazy(() => import('./components/MtrView'))
import PlannerView, { type LegRouteKey } from './components/PlannerView'
import WeatherBanner from './components/WeatherBanner'
import AlertBanners from './components/AlertBanners'
import SmartSuggest from './components/SmartSuggest'
import StampCard from './components/StampCard'
import BackupPanel from './components/BackupPanel'
import { PandaLogo, MascotWelcome, MascotState } from './components/Mascots'
import { recordUse } from './lib/usage'
import { addStamp } from './lib/stamps'
import type { NearbyRow } from './lib/nearby'
import { routeBadges } from './lib/routeMeta'
import type { Favorite } from './lib/store'

type Tab = 'search' | 'nearby' | 'mtr' | 'plan'

export default function App() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Route | null>(null)
  const [tab, setTab] = useState<Tab>('search')
  const [coFilter, setCoFilter] = useState<Co | 'all'>('all')
  const [initialStop, setInitialStop] = useState<string | undefined>()
  const [dark, setDark] = useState(() => localStorage.getItem('kmb.theme') === 'dark')

  const [showBackup, setShowBackup] = useState(false)

  const openRoute = (r: Route, stopId?: string) => {
    setInitialStop(stopId)
    setSelected(r)
    // 智能首頁統計 + 每日印仔(純本機)
    recordUse({ co: r.co, route: r.route, bound: r.bound, serviceType: r.service_type, stopId })
    addStamp()
  }

  const openNearby = (row: NearbyRow) => {
    const r = routes.find(
      (x) =>
        x.co === row.co &&
        x.route === row.route &&
        x.bound === row.dir &&
        x.service_type === row.serviceType,
    )
    if (r) {
      setTab('search')
      openRoute(r, row.stopId)
    }
  }

  // 規劃方案 ride leg → 開返對應路線(planGraph co 名 lightRail ↔ app lrt)
  const openLeg = (k: LegRouteKey) => {
    const co = k.co === 'lightRail' ? 'lrt' : k.co
    const cands = routes.filter(
      (x) =>
        x.co === co &&
        x.route === k.route &&
        x.bound === k.bound &&
        x.service_type === k.serviceType,
    )
    // GMB 同號跨區可能多個 → 用目的地名 tiebreak(兩邊字串來源唔同,寬鬆 includes 匹配)
    const r =
      cands.length > 1 && k.dest
        ? cands.find((x) => x.dest_tc === k.dest) ??
          cands.find((x) => x.dest_tc.includes(k.dest!) || k.dest!.includes(x.dest_tc)) ??
          cands[0]
        : cands[0]
    if (r) openRoute(r, k.boardStopId)
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

  const loadRoutes = () => {
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        // SWR:舊 cache 即刻顯示,背景刷新完靜靜更新
        setRoutes(await getAllRoutes((fresh) => setRoutes(fresh)))
      } catch (e) {
        setError(e instanceof Error ? e.message : '無法載入路線資料')
      } finally {
        setLoading(false)
      }
    })()
  }

  useEffect(loadRoutes, [])

  // 首屏著地後 idle 預載規劃圖(2.3MB chunk),第一次撳「搵路線」唔使等
  useEffect(() => {
    const warm = () => void import('./lib/planGraph').then((m) => m.loadGraph()).catch(() => {})
    const idle = (window as unknown as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback
    const id = idle ? idle(warm, { timeout: 8000 }) : window.setTimeout(warm, 4000)
    return () => {
      if (!idle) clearTimeout(id)
    }
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return []
    return routes
      .filter((r) => r.route.toUpperCase().startsWith(q))
      .filter((r) => coFilter === 'all' || r.co === coFilter)
      .sort((a, b) =>
        a.route.localeCompare(b.route, undefined, { numeric: true }) ||
        a.co.localeCompare(b.co) ||
        a.bound.localeCompare(b.bound) ||
        a.service_type.localeCompare(b.service_type),
      )
      .slice(0, 80)
  }, [routes, query, coFilter])

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar-deco" style={{ top: 8, left: '38%' }}>♡</span>
        <span className="topbar-deco" style={{ top: 30, left: '54%' }}>✦</span>
        <span className="topbar-deco" style={{ bottom: 8, left: '46%' }}>♡</span>
        <span className="topbar-deco" style={{ top: 14, left: '66%' }}>🎀</span>
        <span className="topbar-deco" style={{ bottom: 10, left: '30%' }}>✨</span>
        <div className="topbar-row">
          <h1 onClick={() => { setSelected(null); setTab('search') }}>
            <PandaLogo />可可出行
          </h1>
          <span className="topbar-btns">
            <button
              className="theme-toggle"
              onClick={() => setShowBackup(true)}
              aria-label="備份與還原"
            >
              ⚙️
            </button>
            <button
              className="theme-toggle"
              onClick={() => setDark((d) => !d)}
              aria-label="切換深色模式"
            >
              {dark ? '☀️' : '🌙'}
            </button>
          </span>
        </div>
        <span className="topbar-sub">香港交通到站 · 行程規劃 ♡</span>
      </header>

      <WeatherBanner />

      {!selected && (
        <nav className="tabs">
          <button
            className={tab === 'search' ? 'tab on' : 'tab'}
            onClick={() => setTab('search')}
          >
            🔍 搜尋
          </button>
          <button
            className={tab === 'nearby' ? 'tab on' : 'tab'}
            onClick={() => setTab('nearby')}
          >
            📍 附近
          </button>
          <button
            className={tab === 'mtr' ? 'tab on' : 'tab'}
            onClick={() => setTab('mtr')}
          >
            🚇 鐵路
          </button>
          <button
            className={tab === 'plan' ? 'tab on' : 'tab'}
            onClick={() => setTab('plan')}
          >
            🧭 規劃
          </button>
        </nav>
      )}

      <main className="content">
        {selected ? (
          <RouteStopsView
            route={selected}
            variants={routes.filter((r) => r.route === selected.route && r.co === selected.co)}
            initialOpenStop={initialStop}
            onSwitch={(r) => openRoute(r)}
            onBack={() => setSelected(null)}
          />
        ) : tab === 'nearby' ? (
          <NearbyView onOpen={openNearby} />
        ) : tab === 'mtr' ? (
          <Suspense fallback={<MascotState mood="busy" text="載入鐵路資料…" />}>
            <MtrView />
          </Suspense>
        ) : tab === 'plan' ? (
          <PlannerView onOpenLeg={openLeg} />
        ) : (
          <>
            <div className="co-filter">
              {(['all', ...SEARCH_OPERATORS] as (Co | 'all')[]).map((c) => {
                const active = coFilter === c
                const color = c === 'all' ? '#374151' : CO_COLOR[c]
                return (
                  <button
                    key={c}
                    className={`co-chip ${active ? 'on' : ''}`}
                    style={active ? { background: color, borderColor: color } : { color, borderColor: color }}
                    onClick={() => setCoFilter(c)}
                  >
                    {c === 'all' ? '全部' : coLabel(c)}
                  </button>
                )
              })}
            </div>

            <div className="search">
              <input
                inputMode="text"
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

            {loading && <MascotState mood="busy" text="熊貓幫緊你載入路線資料…" />}
            {error && (
              <div className="error pad">
                ⚠️ {error}{' '}
                <button className="refresh-btn" onClick={loadRoutes}>
                  重試
                </button>
              </div>
            )}

            {!query && !loading && !error && (
              <>
                <SmartSuggest routes={routes} onOpen={openRoute} />
                <MascotWelcome title="今日去邊度呢? 💕" sub="輸入路線號碼,即刻睇到站時間~" />
              </>
            )}
            {!query && !loading && <Favorites onOpen={openFavorite} />}
            {!query && !loading && !error && <StampCard />}

            {query && matches.length === 0 && !loading && (
              <MascotState mood="sad" text={`搵唔到路線「${query}」,試下轉車種 filter?`} />
            )}

            <div className="route-results">
              {matches.map((r, i) => (
                <button
                  key={`${r.co}|${r.route}|${r.bound}|${r.service_type}|${r.uid ?? ''}|${i}`}
                  className="route-card"
                  onClick={() => openRoute(r)}
                >
                  <span className={`route-badge ${coClass(r.co)}`}>{r.route}</span>
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

      <AlertBanners />
      {showBackup && <BackupPanel onClose={() => setShowBackup(false)} />}

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
        天氣:香港天文台 (HKO) · 港鐵/輕鐵:© 港鐵公司 MTR
        <br />
        嶼巴 · 特別交通消息:運輸署 · 全部經 data.gov.hk
      </footer>
    </div>
  )
}
