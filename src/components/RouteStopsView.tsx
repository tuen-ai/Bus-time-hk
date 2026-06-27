import { useEffect, useMemo, useState } from 'react'
import { fetchRouteStops, type Route } from '../api/kmb'
import { getStopMap, isFavorite, toggleFavorite, type Favorite } from '../lib/store'
import EtaPanel from './EtaPanel'
import RouteMap, { type MapStop } from './RouteMap'

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
  onSwitch: (r: Route) => void
  onBack: () => void
}

export default function RouteStopsView({ route, variants, onSwitch, onBack }: Props) {
  const [stops, setStops] = useState<StopRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openStop, setOpenStop] = useState<string | null>(null)
  const [favTick, setFavTick] = useState(0) // 用嚟強制重繪收藏星

  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        const [rs, stopMap] = await Promise.all([
          fetchRouteStops(route.route, route.bound, route.service_type),
          getStopMap(),
        ])
        if (!alive) return
        const rows = rs
          .sort((a, b) => Number(a.seq) - Number(b.seq))
          .map((s) => {
            const info = stopMap.get(s.stop)
            return {
              seq: s.seq,
              stopId: s.stop,
              name: info?.name_tc ?? s.stop,
              lat: Number(info?.lat ?? 0),
              lng: Number(info?.long ?? 0),
            }
          })
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
        <span className="route-badge">{route.route}</span>
        <div className="route-dest">
          <div className="muted small">往</div>
          <div className="dest-name">{route.dest_tc}</div>
          <div className="muted small">由 {route.orig_tc}</div>
        </div>
      </div>

      {sortedVariants.length > 1 && (
        <div className="variant-bar">
          {sortedVariants.map((v) => {
            const active = v.bound === route.bound && v.service_type === route.service_type
            return (
              <button
                key={`${v.bound}|${v.service_type}`}
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

      {!loading && mapStops.length > 1 && (
        <RouteMap
          route={route.route}
          bound={route.bound}
          serviceType={route.service_type}
          stops={mapStops}
        />
      )}

      <ol className="stop-list">
        {stops.map((row) => {
          const fav = makeFav(row)
          const faved = isFavorite(fav)
          const open = openStop === row.stopId
          return (
            <li key={row.stopId} className={`stop-item ${open ? 'open' : ''}`}>
              <div className="stop-head">
                <button
                  className="stop-main"
                  onClick={() => setOpenStop(open ? null : row.stopId)}
                >
                  <span className="stop-seq">{row.seq}</span>
                  <span className="stop-name">{row.name}</span>
                  <span className="chev">{open ? '▾' : '▸'}</span>
                </button>
                <button
                  className={`star ${faved ? 'on' : ''}`}
                  aria-label="收藏"
                  onClick={() => {
                    toggleFavorite(fav)
                    setFavTick((t) => t + 1)
                  }}
                >
                  {faved ? '★' : '☆'}
                </button>
              </div>
              {open && (
                <EtaPanel
                  key={favTick}
                  stopId={row.stopId}
                  route={route.route}
                  serviceType={route.service_type}
                />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
