import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  getAllRoutes,
  coLabel,
  coClass,
  routeKey,
  routeKeyOf,
  CO_COLOR,
  SEARCH_OPERATORS,
  type Route,
  type Co,
  type RouteKeyLike,
} from './api/bus'
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
import DisplayMode from './components/DisplayMode'
// 藍牙小屏推送:只揀開先載(Web Bluetooth,唔加重首屏)
const ClockPush = lazy(() => import('./components/ClockPush'))
import { PandaLogo, MascotWelcome, MascotState } from './components/Mascots'
import { recordUse } from './lib/usage'
import { addStamp } from './lib/stamps'
import { loadGraph } from './lib/planGraph'
import type { NearbyRow } from './lib/nearby'
import { routeBadges } from './lib/routeMeta'
import type { Favorite } from './lib/store'

type Tab = 'search' | 'nearby' | 'mtr' | 'plan'

const TABS: { id: Tab; label: string }[] = [
  { id: 'search', label: '🔍 搜尋' },
  { id: 'nearby', label: '📍 附近' },
  { id: 'mtr', label: '🚇 鐵路' },
  { id: 'plan', label: '🧭 規劃' },
]

const THEME_KEY = 'kmb.theme'
// 未揀過就跟系統深色設定
const initialDark = (): boolean => {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'dark' || saved === 'light') return saved === 'dark'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export default function App() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Route | null>(null)
  const [tab, setTab] = useState<Tab>('search')
  const [coFilter, setCoFilter] = useState<Co | 'all'>('all')
  const [initialStop, setInitialStop] = useState<string | undefined>()
  const [dark, setDark] = useState(initialDark)

  const [showBackup, setShowBackup] = useState(false)
  // 📺 門口顯示模式:#display 直達 / localStorage 記住(iPad 重載都會自動返去)
  const [showDisplay, setShowDisplay] = useState(
    () => window.location.hash === '#display' || localStorage.getItem('kkcx.display') === '1',
  )
  const enterDisplay = () => {
    localStorage.setItem('kkcx.display', '1')
    setShowBackup(false)
    setShowDisplay(true)
  }
  const exitDisplay = () => {
    localStorage.removeItem('kkcx.display')
    if (window.location.hash === '#display') {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    setShowDisplay(false)
  }

  // 🖥️ 藍牙小屏推送(SKD-CLOCK)
  const [showClock, setShowClock] = useState(false)
  const enterClock = () => {
    setShowBackup(false)
    setShowClock(true)
  }

  // app 開住時 hash 轉做 #display(例如撳主畫面書籤)都要入到
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#display') {
        localStorage.setItem('kkcx.display', '1')
        setShowDisplay(true)
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // 「帶我去」(例如 24/7 分店)→ 跳去規劃 tab 並預設終點
  const [planDest, setPlanDest] = useState<{ label: string; lat: number; lng: number } | null>(null)

  const planTo = (t: { label: string; lat: number; lng: number }) => {
    setPlanDest(t)
    setSelected(null)
    setTab('plan')
  }

  const openRoute = (r: Route, stopId?: string) => {
    setInitialStop(stopId)
    setSelected(r)
    // 智能首頁統計 + 每日印仔(純本機)
    recordUse({ co: r.co, route: r.route, bound: r.bound, serviceType: r.service_type, stopId })
    addStamp()
  }

  // co|route|bound|serviceType → Route[](GMB 同號跨區可能多於一條);收藏/附近/規劃 leg 都靠呢個對返
  const routeIndex = useMemo(() => {
    const m = new Map<string, Route[]>()
    for (const r of routes) {
      const k = routeKeyOf(r)
      const arr = m.get(k)
      if (arr) arr.push(r)
      else m.set(k, [r])
    }
    return m
  }, [routes])

  const findRoute = (k: RouteKeyLike, dest?: string): Route | undefined => {
    const cands = routeIndex.get(routeKey(k)) ?? []
    if (cands.length <= 1 || !dest) return cands[0]
    // 用目的地名 tiebreak(兩邊字串來源唔同,寬鬆 includes 匹配)
    return (
      cands.find((x) => x.dest_tc === dest) ??
      cands.find((x) => x.dest_tc.includes(dest) || dest.includes(x.dest_tc)) ??
      cands[0]
    )
  }

  const openNearby = (row: NearbyRow) => {
    const r = findRoute({ co: row.co, route: row.route, bound: row.dir, serviceType: row.serviceType })
    if (r) {
      setTab('search')
      openRoute(r, row.stopId)
    }
  }

  // 規劃方案 ride leg → 開返對應路線(planGraph co 名 lightRail ↔ app lrt)
  const openLeg = (k: LegRouteKey) => {
    const co = (k.co === 'lightRail' ? 'lrt' : k.co) as Co
    const r = findRoute({ co, route: k.route, bound: k.bound, serviceType: k.serviceType }, k.dest)
    if (r) openRoute(r, k.boardStopId)
  }

  const openFavorite = (f: Favorite) => {
    const r = findRoute(f)
    if (r) {
      setTab('search')
      openRoute(r, f.stopId)
    }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
    // 瀏覽器 UI(地址列/狀態欄)顏色跟主題
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1a0f17' : '#ff4f95')
  }, [dark])

  // 量度 topbar 實際高度 → tabs sticky 貼喺佢正下方(iOS 瀏海 safe-area 令高度唔固定)
  const topbarRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = topbarRef.current
    if (!el) return
    const apply = () => document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 捲落去就收細 topbar(慳返手機螢幕空間)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setCompact(window.scrollY > 48))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

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
    const warm = () => void loadGraph().catch(() => {})
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

  const variants = useMemo(
    () => (selected ? routes.filter((r) => r.route === selected.route && r.co === selected.co) : []),
    [routes, selected],
  )

  const goHome = () => {
    setSelected(null)
    setTab('search')
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="app">
      <header ref={topbarRef} className={`topbar ${compact ? 'compact' : ''}`}>
        <span className="topbar-deco" style={{ top: 8, left: '38%' }}>♡</span>
        <span className="topbar-deco" style={{ top: 30, left: '54%' }}>✦</span>
        <span className="topbar-deco" style={{ bottom: 8, left: '46%' }}>♡</span>
        <span className="topbar-deco" style={{ top: 14, left: '66%' }}>🎀</span>
        <span className="topbar-deco" style={{ bottom: 10, left: '30%' }}>✨</span>
        <div className="topbar-row">
          <h1>
            <button className="topbar-home" onClick={goHome} aria-label="返回首頁">
              <PandaLogo />可可出行
            </button>
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
        <nav className="tabs" aria-label="主要功能">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'tab on' : 'tab'}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      <main className="content">
        {selected ? (
          <RouteStopsView
            route={selected}
            variants={variants}
            initialOpenStop={initialStop}
            onSwitch={(r) => openRoute(r)}
            onBack={() => setSelected(null)}
          />
        ) : tab === 'nearby' ? (
          <NearbyView onOpen={openNearby} onPlanTo={planTo} />
        ) : tab === 'mtr' ? (
          <Suspense fallback={<MascotState mood="busy" text="載入鐵路資料…" />}>
            <MtrView />
          </Suspense>
        ) : tab === 'plan' ? (
          <PlannerView onOpenLeg={openLeg} initialDest={planDest} />
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
                type="search"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                aria-label="搜尋路線號碼"
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
                    <span className="route-dest-line">
                      <span className={`tag tag-co tag-${r.co}`}>{coLabel(r.co)}</span>
                      <span className="muted small">往</span>
                      <span className="route-dest-name">{r.dest_tc}</span>
                      {routeBadges(r.route, r.service_type).map((b) => (
                        <span key={b.kind} className={`tag tag-${b.kind}`}>
                          {b.label}
                        </span>
                      ))}
                    </span>
                    <span className="muted small route-orig">由 {r.orig_tc}</span>
                  </span>
                  <span className="chev">›</span>
                </button>
              ))}
            </div>
          </>
        )}
      </main>

      <AlertBanners />
      {showBackup && (
        <BackupPanel
          onClose={() => setShowBackup(false)}
          onEnterDisplay={enterDisplay}
          onEnterClock={enterClock}
        />
      )}
      {showDisplay && <DisplayMode onExit={exitDisplay} />}
      {showClock && (
        <Suspense fallback={null}>
          <ClockPush onExit={() => setShowClock(false)} />
        </Suspense>
      )}

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
