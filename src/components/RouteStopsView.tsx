import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { getRouteStops, coLabel, coClass, type Route } from '../api/bus'
import { favKey, getFavorites, toggleFavorite, type Favorite } from '../lib/store'
import EtaPanel from './EtaPanel'
import type { MapStop } from './RouteMap'

// 地圖(Leaflet)按需載入,搜尋首屏唔使孭住成個地圖庫
const RouteMap = lazy(() => import('./RouteMap'))
import { routeBadges } from '../lib/routeMeta'
import { getFares, fmtFare } from '../lib/fares'
import TrafficAlert from './TrafficAlert'
import { getAlarm, startAlarm, stopAlarm, subscribeAlarm } from '../lib/alarm'
import { primeAudio, askNotify } from '../lib/chime'

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

export default function RouteStopsView({
  route,
  variants,
  initialOpenStop,
  onSwitch,
  onBack,
}: Props) {
  const [stops, setStops] = useState<StopRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openStop, setOpenStop] = useState<string | null>(initialOpenStop ?? null)
  const [fares, setFares] = useState<number[] | null>(null)
  const [favTick, setFavTick] = useState(0) // 撳收藏星後重讀收藏
  // 收藏 key Set:一次 JSON.parse,唔係每個站每次 render 都讀 localStorage
  const favSet = useMemo(() => new Set(getFavorites().map(favKey)), [favTick])
  const [alarmStopId, setAlarmStopId] = useState<string | null>(getAlarm()?.stopId ?? null)

  useEffect(() => subscribeAlarm((a) => setAlarmStopId(a?.stopId ?? null)), [])

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
    setLoading(true)
    setError(null)
    setStops([])
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
        setStops(rows)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : '載入失敗')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [route])

  const sortedVariants = useMemo(
    () =>
      [...variants].sort(
        (a, b) =>
          a.bound.localeCompare(b.bound) || a.service_type.localeCompare(b.service_type),
      ),
    [variants],
  )

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

  return (
    <div>
      <button className="back-btn" onClick={onBack}>
        ‹ 返回
      </button>
      <div className="route-head">
        <span className={`route-badge ${coClass(route.co)}`}>{route.route}</span>
        <div className="route-dest">
          <div className="muted small">
            <span className={`tag tag-co tag-${route.co}`}>{coLabel(route.co)}</span> 往
          </div>
          <div className="dest-name">
            {route.dest_tc}
            {routeBadges(route.route, route.service_type).map((b) => (
              <span key={b.kind} className={`tag tag-${b.kind}`}>
                {b.label}
              </span>
            ))}
          </div>
          <div className="muted small">由 {route.orig_tc}</div>
        </div>
        {fares && fares.length > 0 && (
          <div className="fare-badge" title="全程車費(成人八達通)">
            {fmtFare(fares[0])}
          </div>
        )}
      </div>

      {sortedVariants.length > 1 && (
        <div className="variant-bar">
          {sortedVariants.map((v) => {
            const active = v.bound === route.bound && v.service_type === route.service_type
            return (
              <button
                key={`${v.bound}|${v.service_type}|${v.uid ?? ''}`}
                className={`variant-chip ${active ? 'on' : ''}`}
                onClick={() => !active && onSwitch(v)}
              >
                往 {v.dest_tc}
                {v.service_type !== '1' && <span className="small"> ·特{v.service_type}</span>}
              </button>
            )
          })}
        </div>
      )}

      {loading && <div className="muted pad">載入車站…</div>}
      {error && <div className="error pad">⚠️ {error}</div>}

      {!loading && mapStops.length > 0 && <TrafficAlert stops={mapStops} />}

      {!loading && mapStops.length > 1 && (
        <Suspense fallback={<div className="map muted" style={{ display: 'grid', placeItems: 'center' }}>🗺️ 地圖載入中…</div>}>
          <RouteMap route={route} stops={mapStops} focusStopId={openStop ?? undefined} />
        </Suspense>
      )}

      <ol className="stop-list">
        {stops.map((row, idx) => {
          const fav = makeFav(row)
          const faved = favSet.has(favKey(fav))
          const open = openStop === row.stopId
          const fare = fares && idx < fares.length ? fares[idx] : null
          return (
            <li key={row.stopId} className={`stop-item ${open ? 'open' : ''}`}>
              <div className="stop-head">
                <button
                  className="stop-main"
                  aria-expanded={open}
                  onClick={() => setOpenStop(open ? null : row.stopId)}
                >
                  <span className="stop-seq">{row.seq}</span>
                  <span className="stop-name">{row.name}</span>
                  {fare != null && <span className="fare-pill">{fmtFare(fare)}</span>}
                  <span className="chev">{open ? '▾' : '▸'}</span>
                </button>
                <button
                  className={`bell ${alarmStopId === row.stopId ? 'on' : ''}`}
                  aria-label={alarmStopId === row.stopId ? '取消落車提醒' : '設落車提醒'}
                  aria-pressed={alarmStopId === row.stopId}
                  title="接近呢個站時震動+響鈴提醒落車"
                  onClick={() => void toggleAlarm(row)}
                >
                  🔔
                </button>
                <button
                  className={`star ${faved ? 'on' : ''}`}
                  aria-label={faved ? '取消收藏' : '收藏'}
                  aria-pressed={faved}
                  onClick={() => {
                    toggleFavorite(fav)
                    setFavTick((t) => t + 1)
                  }}
                >
                  {faved ? '★' : '☆'}
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
