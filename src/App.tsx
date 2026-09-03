import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { getAllRoutes, routeKey, routeKeyOf, type Route, type Co, type RouteKeyLike } from './api/bus'
import SearchView from './components/SearchView'
import RouteStopsView from './components/RouteStopsView'
import NearbyView from './components/NearbyView'

// 鐵路頁拉埋 Leaflet 落嚟 —— 揀咗先載,搜尋首屏輕好多
const MtrView = lazy(() => import('./components/MtrView'))
import PlannerView, { type LegRouteKey } from './components/PlannerView'
import WeatherBanner from './components/WeatherBanner'
import AlertBanners from './components/AlertBanners'
import BackupPanel from './components/BackupPanel'
import DisplayMode from './components/DisplayMode'
// 藍牙小屏推送:只揀開先載(Web Bluetooth,唔加重首屏)
const ClockPush = lazy(() => import('./components/ClockPush'))
import { PandaLogo, MascotState } from './components/Mascots'
import { recordUse } from './lib/usage'
import { addStamp } from './lib/stamps'
import { loadGraph } from './lib/planGraph'
import type { NearbyRow } from './lib/nearby'
import type { Favorite } from './lib/store'
import { useBackLayer } from './hooks/useBackLayer'

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
  const [selected, setSelected] = useState<Route | null>(null)
  const [tab, setTab] = useState<Tab>('search')
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
      history.replaceState(history.state, '', window.location.pathname + window.location.search)
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

  // 撳返回鍵(Android / 瀏覽器上一頁 / 邊緣滑動)時,逐層退返上一個畫面,唔好即刻閂咗成個 app。
  // 註冊次序 = 畫面由淺到深;門口顯示模式由 DisplayMode 自己註冊(鎖定層)。
  useBackLayer(tab !== 'search', () => setTab('search'))
  useBackLayer(selected !== null, () => setSelected(null))
  useBackLayer(showBackup, () => setShowBackup(false))
  useBackLayer(showClock, () => setShowClock(false))

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
    let cands = routeIndex.get(routeKey(k)) ?? []
    // 嶼巴 2026-09 上游將回程 bound 由 O 改 I → 舊收藏用相反方向再試一次
    if (!cands.length && k.co === 'nlb') {
      cands = routeIndex.get(routeKey({ ...k, bound: k.bound === 'I' ? 'O' : 'I' })) ?? []
    }
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
    // Safari 冇 requestIdleCallback → setTimeout 後備
    const hasIdle = typeof window.requestIdleCallback === 'function'
    const id = hasIdle ? window.requestIdleCallback(warm, { timeout: 8000 }) : window.setTimeout(warm, 4000)
    return () => {
      if (hasIdle) window.cancelIdleCallback(id)
      else clearTimeout(id)
    }
  }, [])

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
        <span className="topbar-deco" style={{ top: 8, left: '38%' }}>
          ♡
        </span>
        <span className="topbar-deco" style={{ top: 30, left: '54%' }}>
          ✦
        </span>
        <span className="topbar-deco" style={{ bottom: 8, left: '46%' }}>
          ♡
        </span>
        <span className="topbar-deco" style={{ top: 14, left: '66%' }}>
          🎀
        </span>
        <span className="topbar-deco" style={{ bottom: 10, left: '30%' }}>
          ✨
        </span>
        <div className="topbar-row">
          <h1>
            <button className="topbar-home" onClick={goHome} aria-label="返回首頁">
              <PandaLogo />
              可可出行
            </button>
          </h1>
          <span className="topbar-btns">
            <button className="theme-toggle" onClick={() => setShowBackup(true)} aria-label="備份與還原">
              ⚙️
            </button>
            <button className="theme-toggle" onClick={() => setDark((d) => !d)} aria-label="切換深色模式">
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
          <SearchView
            routes={routes}
            loading={loading}
            error={error}
            onRetry={loadRoutes}
            onOpen={openRoute}
            onOpenFavorite={openFavorite}
          />
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
        <br />
        地址搜尋:政府 ALS;後備 komoot Photon(你輸入嘅地址會傳送到該服務)· 其他資料只存喺你部機
      </footer>
    </div>
  )
}
