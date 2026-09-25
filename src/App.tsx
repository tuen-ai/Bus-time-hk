import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAllRoutes, indexRoutes, pickRoute, type Route, type Co, type RouteKeyLike } from './api/bus'
import SearchView from './components/SearchView'
import RouteStopsView from './components/RouteStopsView'
import type { LegRouteKey } from './components/PlannerView'
import WeatherBanner from './components/WeatherBanner'
import AlertBanners from './components/AlertBanners'
import { PandaLogo, MascotState } from './components/Mascots'
import { recordUse } from './lib/usage'
import { addStamp } from './lib/stamps'
import { loadGraph } from './lib/planGraph'
import { friendlyError } from './lib/http'
import { lazyRetry } from './lib/lazyRetry'
import { lsDel, lsGet, lsSet } from './lib/ls'
import { routeIdentity } from './lib/search'
import type { NearbyRow } from './lib/nearby'
import type { Favorite } from './lib/store'
import { useBackLayer } from './hooks/useBackLayer'

// 首屏淨係要搜尋:其他分頁 / 設定 / 顯示模式揀咗先載(舊分頁跨部署 chunk 唔見咗會自動重載一次)
const loadNearby = () => import('./components/NearbyView')
const loadPlanner = () => import('./components/PlannerView')
const loadBackup = () => import('./components/BackupPanel')
// 鐵路頁拉埋 Leaflet 落嚟 —— 揀咗先載
const loadMtr = () => import('./components/MtrView')
const NearbyView = lazyRetry(loadNearby)
const PlannerView = lazyRetry(loadPlanner)
const MtrView = lazyRetry(loadMtr)
const BackupPanel = lazyRetry(loadBackup)
const DisplayMode = lazyRetry(() => import('./components/DisplayMode'))
// 藍牙小屏推送:只揀開先載(Web Bluetooth,唔加重首屏)
const ClockPush = lazyRetry(() => import('./components/ClockPush'))

type Tab = 'search' | 'nearby' | 'mtr' | 'plan'

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'search', icon: '🔍', label: '搜尋' },
  { id: 'nearby', icon: '📍', label: '附近' },
  { id: 'mtr', icon: '🚇', label: '鐵路' },
  { id: 'plan', icon: '🧭', label: '規劃' },
]

// 規劃圖(2.3MB chunk)唔再每次開 app 都預載 —— 淨係有意圖(撳規劃 tab / 入到規劃頁)先載;慳數據模式唔預載
const saveData = () => !!(navigator as { connection?: { saveData?: boolean } }).connection?.saveData
const warmGraph = () => {
  if (!saveData()) void loadGraph().catch(() => {})
}
const ignore = () => {}
/** 手指撳落就開始載嗰頁 chunk,放手(click)時多數已經載好 */
const PREFETCH: Partial<Record<Tab, () => void>> = {
  nearby: () => void loadNearby().catch(ignore),
  mtr: () => void loadMtr().catch(ignore),
  plan: () => {
    void loadPlanner().catch(ignore)
    warmGraph()
  },
}

const THEME_KEY = 'kmb.theme'
// 未揀過就跟系統深色設定
const initialDark = (): boolean => {
  const saved = lsGet(THEME_KEY)
  if (saved === 'dark' || saved === 'light') return saved === 'dark'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

// 📺 門口顯示模式:#display 直達 / localStorage 記住(iPad 重載都會自動返去)
const DISPLAY_KEY = 'kkcx.display'
const DISPLAY_HASH = '#display'
/** 清走 URL 嘅 #display(保留 history.state)。唔好留喺 history:
 *  退出時 useBackLayer go(-1) 返去嗰格如果仲係 #display,hashchange 會即刻彈返入顯示模式 */
const stripDisplayHash = () => {
  if (window.location.hash === DISPLAY_HASH) {
    history.replaceState(history.state, '', window.location.pathname + window.location.search)
  }
}

/** lazy 分頁載入中:頭 300ms 乜都唔出(快機唔會閃),慢先出熊貓 */
function TabLoading() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), 300)
    return () => clearTimeout(t)
  }, [])
  return <div className="tab-loading">{show && <MascotState mood="busy" text="熊貓搬緊嘢過嚟…" />}</div>
}

/** 顯示模式 chunk 載入中:先頂住一層鎖定返回層,等 DisplayMode 自己嗰層接手。
 *  由設定開顯示模式 → 閂設定同開呢層喺同一個 commit,history 深度唔變(唔會 go(-1) 完又 push 撞車);
 *  載入中撳 Esc / 返回鍵亦唔會關咗底下睇唔到嘅路線頁 */
function KioskHold() {
  useBackLayer(true, ignore, { locked: true })
  return <TabLoading />
}

export default function App() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Route | null>(null)
  const [tab, setTab] = useState<Tab>('search')
  const [initialStop, setInitialStop] = useState<string | undefined>()
  const [dark, setDark] = useState(initialDark)
  // 搜尋字 / 營辦商 filter 放喺 App:開路線再撳返回,結果仲喺度
  const [query, setQuery] = useState('')
  const [coFilter, setCoFilter] = useState<Co | 'all'>('all')
  // 由搜尋結果開路線 → 返嚟時焦點放返嗰張卡
  const [returnFocus, setReturnFocus] = useState<string | null>(null)
  const clearReturnFocus = useCallback(() => setReturnFocus(null), [])

  const [showBackup, setShowBackup] = useState(false)
  const [showDisplay, setShowDisplay] = useState(
    () => window.location.hash === DISPLAY_HASH || lsGet(DISPLAY_KEY) === '1',
  )
  const enterDisplay = () => {
    lsSet(DISPLAY_KEY, '1')
    setShowBackup(false)
    setShowDisplay(true)
  }
  const exitDisplay = () => {
    lsDel(DISPLAY_KEY)
    stripDisplayHash()
    setShowDisplay(false)
  }

  // 🖥️ 藍牙小屏推送(SKD-CLOCK)
  const [showClock, setShowClock] = useState(false)
  const enterClock = () => {
    setShowBackup(false)
    setShowClock(true)
  }

  // #display(開 app 時 / 開住時撳主畫面書籤)→ 轉做 localStorage 記住,再即刻清走 hash
  useEffect(() => {
    const take = () => {
      if (window.location.hash !== DISPLAY_HASH) return
      lsSet(DISPLAY_KEY, '1')
      stripDisplayHash()
      setShowDisplay(true)
    }
    take()
    window.addEventListener('hashchange', take)
    return () => window.removeEventListener('hashchange', take)
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

  const openFromSearch = (r: Route, stopId?: string) => {
    openRoute(r, stopId)
    setReturnFocus(stopId ? null : routeIdentity(r))
  }

  // 撳返回鍵(Android / 瀏覽器上一頁 / 邊緣滑動)時,逐層退返上一個畫面,唔好即刻閂咗成個 app。
  // 鍵盤 Esc 都會關最上面嗰層(分頁唔算「疊上去」,Esc 唔會跳 tab)。
  // 註冊次序 = 畫面由淺到深;門口顯示模式由 DisplayMode 自己註冊(鎖定層)。
  useBackLayer(tab !== 'search', () => setTab('search'), { escape: false })
  useBackLayer(selected !== null, () => setSelected(null))
  useBackLayer(showBackup, () => setShowBackup(false))
  useBackLayer(showClock, () => setShowClock(false))

  // 設定 / 小屏推送閂返 → 焦點返去 ⚙️(鍵盤唔會跌去 body)
  const gearRef = useRef<HTMLButtonElement>(null)
  const overlayOpen = showBackup || showClock
  const wasOverlay = useRef(false)
  useEffect(() => {
    if (wasOverlay.current && !overlayOpen && !showDisplay) gearRef.current?.focus({ preventScroll: true })
    wasOverlay.current = overlayOpen
  }, [overlayOpen, showDisplay])

  // co|route|bound|serviceType → Route[](GMB 同號跨區可能多於一條);收藏/附近/規劃 leg 都靠呢個對返
  const routeIndex = useMemo(() => indexRoutes(routes), [routes])

  // 嶼巴舊收藏 bound 反轉再試、同 key 多條用目的地 tiebreak —— 規則同測試喺 api/bus.ts pickRoute
  const findRoute = (k: RouteKeyLike, dest?: string): Route | undefined =>
    pickRoute(routeIndex, { ...k, dest })

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
    lsSet(THEME_KEY, dark ? 'dark' : 'light')
    // 瀏覽器 UI(地址列/狀態欄)顏色跟主題 + topbar 漸變起點
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1a0f17' : '#db2777')
  }, [dark])

  // 量度 topbar 實際高度 → tabs sticky 貼喺佢正下方(iOS 瀏海 safe-area 令高度唔固定)。
  // 顯示模式時冇 topbar;退出後係新嘅 <header>,要重新量同觀察。
  const topbarRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (showDisplay) return
    const el = topbarRef.current
    if (!el) return
    const apply = () => document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [showDisplay])

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
        // 唔好直接顯示英文錯誤(例如 "Failed to fetch")
        setError(`路線資料載入唔到:${friendlyError(e)}`)
      } finally {
        setLoading(false)
      }
    })()
  }

  useEffect(loadRoutes, [])

  // 入到規劃頁(撳 tab / 「帶我去」/ 返回)先預熱規劃圖
  const onPlanner = tab === 'plan' && !selected && !showDisplay
  useEffect(() => {
    if (onPlanner) warmGraph()
  }, [onPlanner])

  const variants = useMemo(
    () => (selected ? routes.filter((r) => r.route === selected.route && r.co === selected.co) : []),
    [routes, selected],
  )

  // 門口顯示模式(kiosk):唔好喺底下繼續 render 成個 app —— 收藏 / 附近會照樣每 5 秒輪詢,
  // 同顯示模式自己嘅輪詢加埋,請求數多三倍。AlertBanners 保留(落車鬧鐘 / 出門提醒照響)。
  if (showDisplay) {
    return (
      <>
        <Suspense fallback={<KioskHold />}>
          <DisplayMode onExit={exitDisplay} />
        </Suspense>
        <AlertBanners />
      </>
    )
  }

  const goHome = () => {
    setSelected(null)
    setTab('search')
    setQuery('')
    setCoFilter('all')
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="app">
      <header ref={topbarRef} className={`topbar ${compact ? 'compact' : ''}`}>
        {/* 純裝飾:放喺字嘅右邊空位,唔好壓住標題 / 副題 */}
        <span className="topbar-decos" aria-hidden="true">
          <span className="topbar-deco d1">♡</span>
          <span className="topbar-deco d2">✦</span>
          <span className="topbar-deco d3">🎀</span>
          <span className="topbar-deco d4">✨</span>
          <span className="topbar-deco d5">♡</span>
        </span>
        <div className="topbar-row">
          <h1>
            <button className="topbar-home" onClick={goHome} aria-label="可可出行(返回首頁)">
              <PandaLogo />
              可可出行
            </button>
          </h1>
          <span className="topbar-btns">
            <button
              ref={gearRef}
              className="theme-toggle"
              onPointerDown={() => void loadBackup().catch(ignore)}
              onClick={() => setShowBackup(true)}
              aria-label="設定"
              aria-haspopup="dialog"
            >
              <span aria-hidden="true">⚙️</span>
            </button>
            <button
              className="theme-toggle"
              onClick={() => setDark((d) => !d)}
              aria-label="深色模式"
              aria-pressed={dark}
            >
              <span aria-hidden="true">{dark ? '☀️' : '🌙'}</span>
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
              onPointerDown={PREFETCH[t.id]}
              onClick={() => setTab(t.id)}
            >
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>
      )}

      <main className="content">
        <Suspense fallback={<TabLoading />}>
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
              onOpen={openFromSearch}
              onOpenFavorite={openFavorite}
              query={query}
              onQuery={setQuery}
              coFilter={coFilter}
              onCoFilter={setCoFilter}
              focusKey={returnFocus}
              onFocusDone={clearReturnFocus}
            />
          )}
        </Suspense>
      </main>

      <AlertBanners />
      {showBackup && (
        <Suspense fallback={null}>
          <BackupPanel
            onClose={() => setShowBackup(false)}
            onEnterDisplay={enterDisplay}
            onEnterClock={enterClock}
          />
        </Suspense>
      )}
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
