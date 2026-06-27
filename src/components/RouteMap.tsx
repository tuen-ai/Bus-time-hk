import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import type { Feature, LineString } from 'geojson'
import { fetchRouteEta } from '../api/kmb'
import { loadRouteLine, lineFromStops } from '../lib/geometry'
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
  route: string
  bound: 'I' | 'O'
  serviceType: string
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

export default function RouteMap({ route, bound, serviceType, stops }: Props) {
  const [line, setLine] = useState<Feature<LineString> | null>(null)
  const [isReal, setIsReal] = useState(false)
  const [buses, setBuses] = useState<PredictedBus[]>([])
  const snappedRef = useRef<SnappedStop[]>([])
  const etaRef = useRef<Map<number, number>>(new Map())

  // 載入路線幾何(真實 → fallback 直線)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const real = await loadRouteLine(route, bound, serviceType)
      if (!alive) return
      if (real) {
        setLine(real)
        setIsReal(true)
      } else {
        setLine(lineFromStops(stops))
        setIsReal(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [route, bound, serviceType, stops])

  // 線一準備好就 snap 各站(只計一次)
  useEffect(() => {
    snappedRef.current = line ? snapStops(line, stops) : []
  }, [line, stops])

  // 每 30 秒 fetch route-eta → 建立 seq→到站時間
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const data = await fetchRouteEta(route, serviceType)
        if (!alive) return
        const m = new Map<number, number>()
        for (const e of data) {
          if (e.dir !== bound || e.eta_seq !== 1 || !e.eta) continue
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
  }, [route, bound, serviceType])

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
          <Marker key={i} position={[b.lat, b.lng]} icon={busIcon(`${b.minsToNext}分`)} />
        ))}
      </MapContainer>
      <div className="map-disclaimer">
        🚌 預測巴士位置 · 僅供參考(此 API 無 GPS,位置由到站時間推算)
        {!isReal && ' · 路線用站點直線(未有行車幾何)'}
      </div>
    </div>
  )
}
