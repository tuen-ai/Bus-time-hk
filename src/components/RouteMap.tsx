import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import type { Feature, LineString } from 'geojson'
import { getRouteEta, type Route } from '../api/bus'
import { loadRouteLine, lineFromOsrm, lineFromStops } from '../lib/geometry'
import { snapStops, predictBuses, type SnappedStop, type PredictedBus } from '../lib/busPredict'
import { busIcon } from '../lib/mapIcons'
import { TILE_URL, TILE_ATTRIB } from '../lib/mapConfig'

export interface MapStop {
  seq: number
  stopId: string
  name: string
  lat: number
  lng: number
}

interface Props {
  route: Route
  stops: MapStop[]
}

const ETA_REFRESH_MS = 30_000
const ANIM_MS = 1_000

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [24, 24] })
  }, [bounds, map])
  return null
}

export default function RouteMap({ route, stops }: Props) {
  const [line, setLine] = useState<Feature<LineString> | null>(null)
  const [source, setSource] = useState<'real' | 'osrm' | 'straight'>('real')
  const [buses, setBuses] = useState<PredictedBus[]>([])
  const snappedRef = useRef<SnappedStop[]>([])
  const etaRef = useRef<Map<number, number>>(new Map())

  // 載入路線幾何(真實 → fallback 直線)
  useEffect(() => {
    let alive = true
    ;(async () => {
      // 三層後備:真實幾何 → OSRM 道路 snap → 站對站直線
      const real = await loadRouteLine(route.co, route.route, route.bound, route.service_type)
      if (!alive) return
      if (real) {
        setLine(real)
        setSource('real')
        return
      }
      const osrm = await lineFromOsrm(stops)
      if (!alive) return
      if (osrm) {
        setLine(osrm)
        setSource('osrm')
      } else {
        setLine(lineFromStops(stops))
        setSource('straight')
      }
    })()
    return () => {
      alive = false
    }
  }, [route, stops])

  // 線一準備好就 snap 各站(只計一次)
  useEffect(() => {
    snappedRef.current = line ? snapStops(line, stops) : []
  }, [line, stops])

  // 每 30 秒 fetch route-eta → 建立 seq→到站時間
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const data = await getRouteEta(route)
        if (!alive) return
        if (!data) {
          etaRef.current = new Map() // CTB 無全線 ETA → 唔顯示預測巴士
          return
        }
        const m = new Map<number, number>()
        for (const e of data) {
          if (e.dir !== route.bound || e.eta_seq !== 1 || !e.eta) continue
          m.set(e.seq, new Date(e.eta).getTime())
        }
        etaRef.current = m
      } catch {
        /* 靜默,下個週期再試 */
      }
    }
    load()
    const id = setInterval(load, ETA_REFRESH_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [route])

  // 每秒按 wall-clock 重算巴士位置
  useEffect(() => {
    const tick = () => {
      if (line && snappedRef.current.length) {
        setBuses(predictBuses(line, snappedRef.current, etaRef.current, Date.now()))
      }
    }
    tick()
    const id = setInterval(tick, ANIM_MS)
    return () => clearInterval(id)
  }, [line])

  const positions = useMemo<[number, number][]>(
    () => (line ? line.geometry.coordinates.map((c) => [c[1], c[0]] as [number, number]) : []),
    [line],
  )
  const bounds = useMemo<LatLngBoundsExpression | null>(
    () => (positions.length ? positions : null),
    [positions],
  )

  if (!line) return <div className="muted pad">載入路線地圖…</div>

  return (
    <div className="route-map-wrap">
      <MapContainer className="map" center={positions[0]} zoom={14} scrollWheelZoom>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} />
        <FitBounds bounds={bounds} />
        <Polyline positions={positions} pathOptions={{ color: '#b91c1c', weight: 5, opacity: 0.85 }} />
        {stops.map((s) => (
          <CircleMarker
            key={s.stopId}
            center={[s.lat, s.lng]}
            radius={4}
            pathOptions={{ color: '#fff', weight: 2, fillColor: '#b91c1c', fillOpacity: 1 }}
          />
        ))}
        {buses.map((b, i) => (
          <Marker key={i} position={[b.lat, b.lng]} icon={busIcon(`${b.minsToNext}分`, i === 0)} />
        ))}
      </MapContainer>
      <div className="map-disclaimer">
        {route.co === 'kmb'
          ? '🚌 預測巴士位置 · 僅供參考(此 API 無 GPS,位置由到站時間推算)'
          : '🚌 城巴暫無預測巴士(API 未提供全線到站,只顯示路線同車站)'}
        {source === 'osrm' && ' · 路線為道路推算(OSRM)'}
        {source === 'straight' && ' · 路線用站點直線(未有行車幾何)'}
      </div>
    </div>
  )
}
