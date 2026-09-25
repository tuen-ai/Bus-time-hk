import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { getRouteStops, coLabel, coClass, routeKeyOf, sameRoute, type Route } from '../api/bus'
import { favKey, getFavorites, toggleFavorite, type Favorite } from '../lib/store'
import EtaPanel from './EtaPanel'
import type { MapStop } from './RouteMap'
import { lazyRetry } from '../lib/lazyRetry'
import { routeBadges } from '../lib/routeMeta'
import { getFares, fmtFare } from '../lib/fares'
import TrafficAlert from './TrafficAlert'
import { getAlarm, startAlarm, stopAlarm, subscribeAlarm } from '../lib/alarm'
import { primeAudio, askNotify } from '../lib/chime'
import { friendlyError } from '../lib/http'
import { pickCounterpartStop, pickReverseVariant, type StopHint } from '../lib/stopMatch'
import { scrollBehavior } from '../lib/motion'

// 地圖(Leaflet)按需載入,搜尋首屏唔使孭住成個地圖庫
const RouteMap = lazyRetry(() => import('./RouteMap'))

interface StopRow {
  seq: string
  stopId: string
  name: string
  lat: number
  lng: number
}

interface Props {
  route: Route
  variants: Route[]
  initialOpenStop?: string
  onSwitch: (r: Route) => void
  onBack: () => void
}

/** 載完嘅站列 / 錯誤,連埋屬於邊條線(換線嗰下唔會用錯舊線嘅站) */
type Loaded = { id: string; rows: StopRow[] } | { id: string; error: string }

const NO_STOPS: StopRow[] = []
const routeIdOf = (r: Route): string => `${routeKeyOf(r)}|${r.uid ?? ''}`
const stopDomId = (stopId: string): string => `stop-${stopId}`

// 撳 ⇄ 返程 / 方向 chip 時,帶「而家打開緊嘅站」過去新方向,載完站列就自動打開對面嗰個站。
// 放 module 層:App 換線會重用呢個 component;就算將來加 key 重新 mount 都唔會唔見。
const CARRY_TTL_MS = 15_000
let carry: { to: Route; hint: StopHint; at: number } | null = null
function takeCarry(r: Route): StopHint | null {
  const c = carry
  carry = null
  return c && sameRoute(c.to, r) && Date.now() - c.at < CARRY_TTL_MS ? c.hint : null
}

const SIDE_STYLE = {
  marginLeft: 'auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
} as const
// ⇄ 返程 / 重試:手指目標 44px(.preset-chip 預設得 40)
const CHIP44_STYLE = { minHeight: 44, whiteSpace: 'nowrap' } as const
const MAP_FALLBACK_STYLE = { display: 'grid', placeItems: 'center' } as const
// 標題只係俾程式搬焦點(tabIndex -1),唔使焦點框
const HEAD_STYLE = { margin: 0, outline: 'none' } as const

export default function RouteStopsView({ route, variants, initialOpenStop, onSwitch, onBack }: Props) {
  const routeId = routeIdOf(route)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [openStop, setOpenStop] = useState<string | null>(initialOpenStop ?? null)
  const [fares, setFares] = useState<number[] | null>(null)
  // 收藏 key Set:一次 JSON.parse,唔係每個站每次 render 都讀 localStorage;撳星就用 toggle 回傳嘅新清單更新
  const [favSet, setFavSet] = useState(() => new Set(getFavorites().map(favKey)))
  const [alarmStopId, setAlarmStopId] = useState<string | null>(getAlarm()?.stopId ?? null)
  const headRef = useRef<HTMLHeadingElement>(null)
  const scrolledFor = useRef<string | null>(null)

  const current = loaded && loaded.id === routeId ? loaded : null
  const stops = current && 'rows' in current ? current.rows : NO_STOPS
  const error = current && 'error' in current ? current.error : null
  const loading = !current

  useEffect(() => subscribeAlarm((a) => setAlarmStopId(a?.stopId ?? null)), [])

  // 由收藏 / 附近帶住指定站開入嚟:以嗰個站為準。之前冇用到嘅 carry(例如撳完 ⇄ 未載完就返回)作廢,
  // 唔好 15 秒內再開同一條線時蓋過用家揀嘅站。只睇 mount 嗰次:換方向時 App 會清走 initialOpenStop
  useEffect(() => {
    if (initialOpenStop) carry = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 開線 / 換方向:焦點落標題(讀屏知道入咗邊條線),頁面返頂;有預選站就等站列載完再捲過去
  useEffect(() => {
    headRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [routeId])

  // 撳鐘仔:設/取消落車鬧鐘
  const toggleAlarm = async (row: StopRow) => {
    if (alarmStopId === row.stopId) {
      stopAlarm()
      return
    }
    primeAudio()
    await askNotify()
    startAlarm({
      stopId: row.stopId,
      stopName: row.name,
      lat: row.lat,
      lng: row.lng,
      routeLabel: `${coLabel(route.co)} ${route.route}`,
    })
  }

  useEffect(() => {
    setFares(null)
    getFares(route.co, route.route, route.bound, route.service_type)
      .then(setFares)
      .catch(() => setFares(null))
  }, [route])

  useEffect(() => {
    let alive = true
    const id = routeIdOf(route)
    ;(async () => {
      try {
        const rs = await getRouteStops(route)
        if (!alive) return
        const rows = rs.map((s) => ({
          seq: String(s.seq),
          stopId: s.stopId,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
        }))
        // 由對面方向轉過嚟:自動打開對面嗰個站;否則保留仲喺呢條線上面嘅站
        const hint = takeCarry(route)
        const counterpart = hint ? pickCounterpartStop(rows, hint) : null
        setOpenStop((cur) => (hint ? counterpart : cur && rows.some((r) => r.stopId === cur) ? cur : null))
        setLoaded({ id, rows })
      } catch (e) {
        if (alive) setLoaded({ id, error: `車站資料載入唔到:${friendlyError(e)}` })
      }
    })()
    return () => {
      alive = false
    }
  }, [route, reloadKey])

  // 站列一載完,將打開咗嘅站(收藏 / 附近 / 對面方向帶過嚟)捲到畫面中間;每條線只捲一次,
  // 之後用家自己撳站唔會再捲
  useEffect(() => {
    if (stops.length === 0 || scrolledFor.current === routeId) return
    scrolledFor.current = routeId
    if (!openStop) return
    const target = stopDomId(openStop)
    requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView?.({ block: 'center', behavior: scrollBehavior() })
    })
  }, [stops, openStop, routeId])

  const sortedVariants = useMemo(
    () =>
      [...variants].sort(
        (a, b) => a.bound.localeCompare(b.bound) || a.service_type.localeCompare(b.service_type),
      ),
    [variants],
  )
  const reverse = useMemo(() => pickReverseVariant(route, sortedVariants), [route, sortedVariants])

  const mapStops = useMemo<MapStop[]>(
    () =>
      stops
        .filter((s) => s.lat && s.lng)
        .map((s) => ({
          seq: Number(s.seq),
          stopId: s.stopId,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
        })),
    [stops],
  )

  const makeFav = (row: StopRow): Favorite => ({
    co: route.co,
    route: route.route,
    bound: route.bound,
    serviceType: route.service_type,
    stopId: row.stopId,
    stopName: row.name,
    dest: route.dest_tc,
  })

  // 換方向 / 班次:帶埋而家打開緊嘅站過去
  const switchTo = (v: Route) => {
    const row = openStop ? stops.find((s) => s.stopId === openStop) : undefined
    carry = row
      ? { to: v, hint: { stopId: row.stopId, name: row.name, lat: row.lat, lng: row.lng }, at: Date.now() }
      : null
    onSwitch(v)
  }

  const retry = () => {
    setLoaded(null)
    setReloadKey((k) => k + 1)
  }

  const badges = routeBadges(route.route, route.service_type)
  const headLabel = [
    `${coLabel(route.co)} ${route.route} 往 ${route.dest_tc}`,
    ...badges.map((b) => b.label),
  ].join(' ')
  const hasFare = !!fares && fares.length > 0

  return (
    <div>
      <button type="button" className="back-btn route-back" onClick={onBack}>
        <span aria-hidden="true">‹ </span>返回
      </button>
      <div className="route-head">
        <span className={`route-badge ${coClass(route.co)}`} aria-hidden="true">
          {route.route}
        </span>
        <div className="route-dest">
          <div className="muted small" aria-hidden="true">
            <span className={`tag tag-co tag-${route.co}`}>{coLabel(route.co)}</span> 往
          </div>
          <h2 className="dest-name" ref={headRef} tabIndex={-1} aria-label={headLabel} style={HEAD_STYLE}>
            {route.dest_tc}
            {badges.map((b) => (
              <span key={b.kind} className={`tag tag-${b.kind}`}>
                {b.label}
              </span>
            ))}
          </h2>
          <div className="muted small">由 {route.orig_tc}</div>
        </div>
        {(hasFare || reverse) && (
          <div style={SIDE_STYLE}>
            {hasFare && (
              <div className="fare-badge" title="全程車費(成人八達通)">
                {fmtFare(fares[0])}
              </div>
            )}
            {reverse && (
              <button
                type="button"
                className="preset-chip"
                style={CHIP44_STYLE}
                onClick={() => switchTo(reverse)}
                aria-label={`返程:往 ${reverse.dest_tc}`}
                title={`轉去返程(往 ${reverse.dest_tc})`}
              >
                <span aria-hidden="true">⇄ </span>返程
              </button>
            )}
          </div>
        )}
      </div>

      {sortedVariants.length > 1 && (
        <div className="variant-bar" role="group" aria-label="方向同班次">
          {sortedVariants.map((v) => {
            const active = sameRoute(v, route)
            return (
              <button
                type="button"
                key={`${v.bound}|${v.service_type}|${v.uid ?? ''}`}
                className={`variant-chip ${active ? 'on' : ''}`}
                aria-pressed={active}
                onClick={() => !active && switchTo(v)}
              >
                往 {v.dest_tc}
                {v.service_type !== '1' && <span className="small"> ·特{v.service_type}</span>}
              </button>
            )
          })}
        </div>
      )}

      {loading && (
        <div className="muted pad" role="status">
          載入車站…
        </div>
      )}
      {error && (
        <div className="error pad" role="alert">
          <span aria-hidden="true">⚠️ </span>
          {error}{' '}
          <button type="button" className="preset-chip" style={CHIP44_STYLE} onClick={retry}>
            重試
          </button>
        </div>
      )}
      {!loading && !error && stops.length === 0 && <div className="muted pad">暫時未有呢條線嘅車站資料</div>}

      {!loading && mapStops.length > 0 && <TrafficAlert stops={mapStops} />}

      {!loading && mapStops.length > 1 && (
        <Suspense
          fallback={
            // 同真地圖一樣高(地圖 + 下面說明),載完唔會推郁下面站列
            <div className="route-map-wrap">
              <div className="map muted" style={MAP_FALLBACK_STYLE} role="status">
                <span>
                  <span aria-hidden="true">🗺️ </span>地圖載入中…
                </span>
              </div>
              <div className="map-disclaimer" aria-hidden="true">
                &nbsp;
              </div>
            </div>
          }
        >
          <RouteMap route={route} stops={mapStops} focusStopId={openStop ?? undefined} />
        </Suspense>
      )}

      <ol className="stop-list">
        {stops.map((row, idx) => {
          const fav = makeFav(row)
          const faved = favSet.has(favKey(fav))
          const open = openStop === row.stopId
          const fare = fares && idx < fares.length ? fares[idx] : null
          const alarmOn = alarmStopId === row.stopId
          return (
            <li key={row.stopId} id={stopDomId(row.stopId)} className={`stop-item ${open ? 'open' : ''}`}>
              <div className="stop-head">
                <button
                  type="button"
                  className="stop-main"
                  aria-expanded={open}
                  onClick={() => setOpenStop(open ? null : row.stopId)}
                >
                  <span className="stop-seq">{row.seq}</span>
                  <span className="stop-name">{row.name}</span>
                  {fare != null && <span className="fare-pill">{fmtFare(fare)}</span>}
                  <span className="chev" aria-hidden="true">
                    {open ? '▾' : '▸'}
                  </span>
                </button>
                <button
                  type="button"
                  className={`bell ${alarmOn ? 'on' : ''}`}
                  aria-label={`落車提醒:${row.name}`}
                  aria-pressed={alarmOn}
                  title="接近呢個站時震動+響鈴提醒落車"
                  onClick={() => void toggleAlarm(row)}
                >
                  <span aria-hidden="true">🔔</span>
                </button>
                <button
                  type="button"
                  className={`star ${faved ? 'on' : ''}`}
                  aria-label={`收藏:${row.name}`}
                  aria-pressed={faved}
                  onClick={() => {
                    setFavSet(new Set(toggleFavorite(fav).map(favKey)))
                  }}
                >
                  <span aria-hidden="true">{faved ? '★' : '☆'}</span>
                </button>
              </div>
              {open && <EtaPanel route={route} stopId={row.stopId} />}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
