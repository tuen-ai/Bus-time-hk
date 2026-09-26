import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getRouteStops, coLabel, coClass, routeKeyOf, sameRoute, type Route } from '../api/bus'
import { getFavorites, sameFav, toggleFavorite, type Favorite } from '../lib/store'
import EtaPanel from './EtaPanel'
import type { MapStop } from './RouteMap'
import { lazyRetry } from '../lib/lazyRetry'
import { routeBadges } from '../lib/routeMeta'
import { getFares, fmtFare } from '../lib/fares'
import TrafficAlert from './TrafficAlert'
import { getAlarm, startAlarm, stopAlarm, subscribeAlarm } from '../lib/alarm'
import { primeAudio, askNotify } from '../lib/chime'
import { friendlyError } from '../lib/http'
import { zhErrorOr } from '../lib/errorText'
import {
  AUTO_NEAREST_MAX_M,
  nearestBoardingStop,
  pickCounterpartStop,
  pickReverseVariant,
  type StopHint,
} from '../lib/stopMatch'
import { scrollBehavior } from '../lib/motion'
import {
  describeGeoError,
  formatDistance,
  geoPermission,
  getNearbyFix,
  isGeoDenied,
  type LatLngFix,
} from '../lib/geo'
import { autoNearestOn } from '../lib/autoNearest'

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

/** 「最近你嘅站」:搵緊 / 已經打開 / 太遠淨係提示 / 畀個掣自己撳(設定閂咗或者定位失敗) */
interface NearStop {
  stopId: string
  seq: string
  name: string
  d: number
}
type Near =
  | { kind: 'locating' }
  | ({ kind: 'opened' } & NearStop)
  | ({ kind: 'far' } & NearStop)
  | { kind: 'offer'; error?: string }

const NO_STOPS: StopRow[] = []
const routeIdOf = (r: Route): string => `${routeKeyOf(r)}|${r.uid ?? ''}`
/** 每行嘅 DOM id:循環線(綠van 等)同一個站出現第二次先加站序,唔好撞 id(第一次照舊 stop-<站>) */
function rowDomIds(rows: StopRow[]): string[] {
  const seen = new Set<string>()
  return rows.map((r) => {
    const dup = seen.has(r.stopId)
    seen.add(r.stopId)
    return dup ? `stop-${r.stopId}-${r.seq}` : `stop-${r.stopId}`
  })
}

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
  // 載資料(站列 / 車費 / ETA / 地圖)用嘅 route:App 由臨時路線換返清單嗰條(同一條線,淨係補咗起點)
  // 唔使重新載,ETA 唔會閃返 skeleton。起點 / ⇄ 返程照用最新嘅 route。站列 / ETA 只睇 key + uid + 目的地
  const dataKey = `${routeId}|${route.dest_tc}`
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 刻意淨係跟 dataKey 換 object
  const dataRoute = useMemo(() => route, [dataKey])
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [openStop, setOpenStop] = useState<string | null>(initialOpenStop ?? null)
  // 循環線同一個站喺站列出現兩次:記住撳咗邊一行(站序),唔好兩行一齊開;冇就開第一行
  const [openRowSeq, setOpenRowSeq] = useState<string | null>(null)
  const [fares, setFares] = useState<number[] | null>(null)
  // 收藏清單:一次 JSON.parse,唔係每個站每次 render 都讀 localStorage;撳星就用 toggle 回傳嘅新清單更新。
  // 用 sameFav 對(同站兩個綠van / 嶼巴變體分開;舊收藏冇 uid 照亮星)
  const [favs, setFavs] = useState<Favorite[]>(getFavorites)
  const [alarmStopId, setAlarmStopId] = useState<string | null>(getAlarm()?.stopId ?? null)
  const headRef = useRef<HTMLHeadingElement>(null)
  const scrolledFor = useRef<string | null>(null)
  // 最近你嘅站:狀態連埋屬於邊條線;每條線自動搵一次;搵到先捲(等打開咗嗰行 render 咗)
  const [nearState, setNearState] = useState<{ id: string; v: Near } | null>(null)
  const [userPos, setUserPos] = useState<LatLngFix | null>(null)
  const nearTried = useRef<string | null>(null)
  const pendingScroll = useRef(false)
  // 定位返嚟嗰陣要知「而家」睇緊邊條線、用家有冇自己揀咗站(async 入面唔可以靠 closure)
  const routeIdRef = useRef(routeId)
  const openStopRef = useRef<string | null>(openStop)

  const near = nearState && nearState.id === routeId ? nearState.v : null
  const current = loaded && loaded.id === routeId ? loaded : null
  const stops = current && 'rows' in current ? current.rows : NO_STOPS
  const error = current && 'error' in current ? current.error : null
  const loading = !current

  // 打開緊邊一行:撳過嗰行(站序 + 站)優先,否則第一個係 openStop 嘅站
  const openIdx = useMemo(() => {
    if (!openStop) return -1
    const exact =
      openRowSeq != null ? stops.findIndex((s) => s.seq === openRowSeq && s.stopId === openStop) : -1
    return exact >= 0 ? exact : stops.findIndex((s) => s.stopId === openStop)
  }, [stops, openStop, openRowSeq])
  const openRow = openIdx >= 0 ? stops[openIdx] : undefined
  const domIds = useMemo(() => rowDomIds(stops), [stops])
  const openDomId = openIdx >= 0 ? domIds[openIdx] : null

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
    setOpenRowSeq(null) // 換咗線:舊線嘅站序冇意思
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
    getFares(dataRoute.co, dataRoute.route, dataRoute.bound, dataRoute.service_type)
      .then(setFares)
      .catch(() => setFares(null))
  }, [dataRoute])

  useEffect(() => {
    let alive = true
    const id = routeIdOf(dataRoute)
    ;(async () => {
      try {
        const rs = await getRouteStops(dataRoute)
        if (!alive) return
        const rows = rs.map((s) => ({
          seq: String(s.seq),
          stopId: s.stopId,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
        }))
        // 由對面方向轉過嚟:自動打開對面嗰個站;否則保留仲喺呢條線上面嘅站。
        // 冇站(攞唔到 / 臨時路線)就唔好清走:撳重試或者 App 換返真路線之後照開返收藏嗰個站
        const hint = takeCarry(dataRoute)
        const counterpart = hint ? pickCounterpartStop(rows, hint) : null
        setOpenStop((cur) =>
          hint ? counterpart : cur && (rows.length === 0 || rows.some((r) => r.stopId === cur)) ? cur : null,
        )
        setLoaded({ id, rows })
      } catch (e) {
        // 自己拋嘅中文句(例如綠van「…車站資料載入唔到…」)已經講清楚,唔好再加前綴講兩次
        if (alive) setLoaded({ id, error: zhErrorOr(e, `車站資料載入唔到:${friendlyError(e)}`) })
      }
    })()
    return () => {
      alive = false
    }
  }, [dataRoute, reloadKey])

  // 站列一載完,將打開咗嘅站(收藏 / 附近 / 對面方向帶過嚟)捲到畫面中間;每條線只捲一次,
  // 之後用家自己撳站唔會再捲
  useEffect(() => {
    if (stops.length === 0 || scrolledFor.current === routeId) return
    scrolledFor.current = routeId
    if (!openDomId) return
    requestAnimationFrame(() => {
      document.getElementById(openDomId)?.scrollIntoView?.({ block: 'center', behavior: scrollBehavior() })
    })
  }, [stops, openDomId, routeId])

  useEffect(() => {
    routeIdRef.current = routeId
    openStopRef.current = openStop
  }, [routeId, openStop])

  // 打開某個站並捲過去(自動 / 撳「最近你」提示都用)
  const openNearStop = useCallback((n: NearStop) => {
    pendingScroll.current = true
    setOpenStop(n.stopId)
    setOpenRowSeq(n.seq)
  }, [])

  // 定位 → 揀最近、上得車嘅站。force = 用家撳掣(照開,唔理遠近同有冇揀咗站)
  const locateNearest = useCallback(
    async (id: string, rows: StopRow[], force: boolean) => {
      setNearState({ id, v: { kind: 'locating' } })
      try {
        const fix = await getNearbyFix()
        if (routeIdRef.current !== id) return
        setUserPos(fix)
        const hit = nearestBoardingStop(rows, fix)
        // 等定位嗰陣用家自己揀咗站:唔好搶
        if (!hit || (!force && openStopRef.current != null)) {
          setNearState(null)
          return
        }
        const row = rows[hit.index]
        const n: NearStop = { stopId: row.stopId, seq: row.seq, name: row.name, d: hit.distance }
        if (force || hit.distance <= AUTO_NEAREST_MAX_M) {
          openNearStop(n)
          setNearState({ id, v: { kind: 'opened', ...n } })
        } else {
          setNearState({ id, v: { kind: 'far', ...n } })
        }
      } catch (e) {
        if (routeIdRef.current !== id) return
        // 自動嗰次俾人拒絕定位就收聲(唔好次次開線都煩);其他情況畀個掣再試
        if (!force && isGeoDenied(e)) setNearState(null)
        else setNearState({ id, v: { kind: 'offer', error: force ? describeGeoError(e) : undefined } })
      }
    },
    [openNearStop],
  )

  // 由搜尋開線(冇預選站、冇由對面方向帶站過嚟):站列一載完就自動打開離你最近嘅站
  useEffect(() => {
    if (stops.length === 0 || nearTried.current === routeId) return
    nearTried.current = routeId
    if (openStop) return
    if (!autoNearestOn()) {
      setNearState({ id: routeId, v: { kind: 'offer' } })
      return
    }
    const id = routeId
    void geoPermission().then((perm) => {
      if (perm === 'denied' || routeIdRef.current !== id) return
      void locateNearest(id, stops, false)
    })
  }, [routeId, stops, openStop, locateNearest])

  // 自動 / 手動打開咗最近嘅站:等嗰行 render 咗先捲到畫面中間
  useEffect(() => {
    if (!pendingScroll.current || !openDomId) return
    pendingScroll.current = false
    requestAnimationFrame(() => {
      document.getElementById(openDomId)?.scrollIntoView?.({ block: 'center', behavior: scrollBehavior() })
    })
  }, [openDomId])

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
    // 同號跨區綠van / 嶼巴變體:記住係邊條,之後開返 / 攞 ETA 唔使靠目的地估
    uid: route.uid,
  })

  // 換方向 / 班次:帶埋而家打開緊嘅站過去
  const switchTo = (v: Route) => {
    const row = openRow
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
    <div className="route-page">
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
          {/* 路線清單未載好時由收藏 / 附近開入嚟嘅臨時路線冇起點:唔好出淨係「由 」 */}
          {route.orig_tc && <div className="muted small">由 {route.orig_tc}</div>}
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

      {near && (
        <div className="near-hint" role="status">
          {near.kind === 'locating' && (
            <span className="muted small">
              <span aria-hidden="true">📍 </span>搵緊離你最近嘅站…
            </span>
          )}
          {near.kind === 'opened' && (
            <button type="button" className="near-chip" onClick={() => openNearStop(near)}>
              <span aria-hidden="true">📍 </span>最近你:{near.name} · 約 {formatDistance(near.d)}
            </button>
          )}
          {near.kind === 'far' && (
            <>
              <span className="muted small">
                <span aria-hidden="true">📍 </span>你附近冇呢條線嘅站(最近:{near.name} ·{' '}
                {formatDistance(near.d)})
              </span>
              <button
                type="button"
                className="preset-chip"
                style={CHIP44_STYLE}
                onClick={() => openNearStop(near)}
              >
                打開
              </button>
            </>
          )}
          {near.kind === 'offer' && (
            <>
              <button
                type="button"
                className="preset-chip"
                style={CHIP44_STYLE}
                onClick={() => void locateNearest(routeId, stops, true)}
              >
                <span aria-hidden="true">📍 </span>搵最近我嘅站
              </button>
              {near.error && <span className="muted small">{near.error}</span>}
            </>
          )}
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
      {!loading && !error && stops.length === 0 && (
        <div className="muted pad">
          暫時攞唔到呢條線嘅車站資料{' '}
          <button type="button" className="preset-chip" style={CHIP44_STYLE} onClick={retry}>
            重試
          </button>
        </div>
      )}

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
          <RouteMap
            route={dataRoute}
            stops={mapStops}
            focusStopId={openStop ?? undefined}
            userPos={userPos ?? undefined}
          />
        </Suspense>
      )}

      <ol className="stop-list">
        {stops.map((row, idx) => {
          const fav = makeFav(row)
          const faved = favs.some((x) => sameFav(x, fav))
          const open = idx === openIdx
          const fare = fares && idx < fares.length ? fares[idx] : null
          const alarmOn = alarmStopId === row.stopId
          return (
            <li
              key={`${row.seq}|${row.stopId}`}
              id={domIds[idx]}
              className={`stop-item ${open ? 'open' : ''}`}
            >
              <div className="stop-head">
                <button
                  type="button"
                  className="stop-main"
                  aria-expanded={open}
                  onClick={() => {
                    setOpenStop(open ? null : row.stopId)
                    setOpenRowSeq(open ? null : row.seq)
                  }}
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
                    setFavs(toggleFavorite(fav))
                  }}
                >
                  <span aria-hidden="true">{faved ? '★' : '☆'}</span>
                </button>
              </div>
              {open && <EtaPanel route={dataRoute} stopId={row.stopId} />}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
