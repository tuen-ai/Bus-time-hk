import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression, PathOptions } from 'leaflet'
import type { Feature, LineString } from 'geojson'
import { getRouteEta, type Route } from '../api/bus'
import { loadRouteLine, lineFromOsrm, lineFromStops } from '../lib/geometry'
import { snapStops, predictBuses, sameBuses, type SnappedStop, type PredictedBus } from '../lib/busPredict'
import { busIcon } from '../lib/mapIcons'
import { TILE_URL, TILE_ATTRIB, TOUCH_MAP_HINT, isTouchMap } from '../lib/mapConfig'
import { getWeather } from '../api/weather'
import { nearestDistrict, rainLevel, rainLabel, type RainLevel } from '../lib/weather'
import { fetchTrafficNews } from '../api/stn'
import { routeDistricts, relevantNotices } from '../lib/stnMatch'
import { usePolling } from '../hooks/usePolling'
import { prefersReducedMotion } from '../lib/motion'
import { useWheelZoomOnFocus } from '../hooks/useWheelZoomOnFocus'

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
  focusStopId?: string
}

const ETA_REFRESH_MS = 30_000
const ANIM_MS = 1_000

// 樣式用常數:每次 render 都係同一個 object,react-leaflet 就唔會逐個站 setStyle
const LINE_STYLE: PathOptions = { color: '#b91c1c', weight: 5, opacity: 0.85 }
const STOP_STYLE: PathOptions = { color: '#fff', weight: 2, fillColor: '#b91c1c', fillOpacity: 1 }
const STOP_STYLE_ON: PathOptions = { ...STOP_STYLE, fillColor: '#f59e0b' }
const PLACEHOLDER_STYLE = { display: 'grid', placeItems: 'center' } as const

// 揀咗站就 zoom 去該站;否則 fit 成條路線(減少動態效果就唔好飛)
function MapFocus({
  bounds,
  focus,
}: {
  bounds: LatLngBoundsExpression | null
  focus: [number, number] | null
}) {
  const map = useMap()
  useWheelZoomOnFocus() // 桌面:撳過地圖先用滾輪縮放,撳走就還返畀頁面捲動
  useEffect(() => {
    const reduce = prefersReducedMotion()
    if (focus) {
      if (reduce) map.setView(focus, 17, { animate: false })
      else map.flyTo(focus, 17, { duration: 0.6 })
    } else if (bounds) map.fitBounds(bounds, { padding: [24, 24], animate: !reduce })
  }, [bounds, focus, map])
  return null
}

/**
 * 預測巴士位置:每秒重算,但只有呢個細 component re-render(得 1–3 個 marker),
 * 成個地圖、條線同幾十個站唔使跟住郁。背景分頁唔計。
 */
function BusLayer({
  line,
  snapped,
  etaBySeq,
}: {
  line: Feature<LineString>
  snapped: SnappedStop[]
  etaBySeq: Map<number, number>
}) {
  const [buses, setBuses] = useState<PredictedBus[]>([])
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return
      const next = predictBuses(line, snapped, etaBySeq, Date.now())
      setBuses((prev) => (sameBuses(prev, next) ? prev : next))
    }
    tick()
    const id = setInterval(tick, ANIM_MS)
    return () => clearInterval(id)
  }, [line, snapped, etaBySeq])
  return (
    <>
      {buses.map((b, i) => (
        <Marker
          key={b.seq}
          position={[b.lat, b.lng]}
          icon={busIcon(`${b.minsToNext}分`, i === 0)}
          interactive={false}
          keyboard={false}
        />
      ))}
    </>
  )
}

// 站點 marker:只喺站 / 揀咗邊個站變先重畫;center 用同一個 array,唔會逐個 setLatLng
const StopMarkers = memo(function StopMarkers({
  stops,
  focusStopId,
}: {
  stops: MapStop[]
  focusStopId?: string
}) {
  const centers = useMemo(
    () => new Map(stops.map((s) => [s.stopId, [s.lat, s.lng] as [number, number]])),
    [stops],
  )
  return (
    <>
      {stops.map((s) => {
        const on = s.stopId === focusStopId
        return (
          <CircleMarker
            key={`${s.seq}-${s.stopId}`}
            center={centers.get(s.stopId) ?? [s.lat, s.lng]}
            radius={on ? 7 : 4}
            pathOptions={on ? STOP_STYLE_ON : STOP_STYLE}
          />
        )
      })}
    </>
  )
})

function disclaimerOf(co: Route['co']): string {
  if (co === 'kmb') return '🚌 預測巴士位置 · 僅供參考(此 API 無 GPS,位置由到站時間推算)'
  if (co === 'lrt') return '🚊 輕鐵路綫示意(站對站連線)'
  return '🚌 此營辦商未提供全線到站,只顯示路線同車站'
}

export default function RouteMap({ route, stops, focusStopId }: Props) {
  const [line, setLine] = useState<Feature<LineString> | null>(null)
  const [source, setSource] = useState<'real' | 'osrm' | 'straight'>('real')
  const [etaBySeq, setEtaBySeq] = useState<Map<number, number> | null>(null)
  // 手機 / 平板(手指為主):單指留畀頁面捲動,兩隻手指先移動 / 縮放地圖;MapContainer 只睇第一次 render
  const [touch] = useState(isTouchMap)

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
      // 輕鐵唔好用 OSRM(行車道路)snap,直接站對站直線
      const osrm = route.co === 'lrt' ? null : await lineFromOsrm(stops)
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
  const snapped = useMemo<SnappedStop[]>(() => (line ? snapStops(line, stops) : []), [line, stops])

  // 每 30 秒 fetch route-eta → 建立 seq→到站時間(只有九巴有全線 ETA;背景分頁暫停)
  const etaSeq = useRef(0)
  usePolling(
    async () => {
      const my = ++etaSeq.current
      try {
        const data = await getRouteEta(route)
        if (my !== etaSeq.current) return // 舊請求遲咗返嚟,唔好蓋過新嘅
        if (!data) {
          setEtaBySeq(null)
          return
        }
        const m = new Map<number, number>()
        for (const e of data) {
          if (e.dir !== route.bound || e.eta_seq !== 1 || !e.eta) continue
          m.set(e.seq, new Date(e.eta).getTime())
        }
        setEtaBySeq(m)
      } catch {
        /* 靜默,下個週期再試 */
      }
    },
    ETA_REFRESH_MS,
    { key: route, enabled: route.co === 'kmb' },
  )

  const positions = useMemo<[number, number][]>(
    () => (line ? line.geometry.coordinates.map((c) => [c[1], c[0]] as [number, number]) : []),
    [line],
  )
  const bounds = useMemo<LatLngBoundsExpression | null>(
    () => (positions.length ? positions : null),
    [positions],
  )
  const focus = useMemo<[number, number] | null>(() => {
    if (!focusStopId) return null
    const s = stops.find((x) => x.stopId === focusStopId)
    return s ? [s.lat, s.lng] : null
  }, [focusStopId, stops])

  // 揀站 → 該區天氣;落雨就喺地圖該位置顯示雨特效
  const [rain, setRain] = useState<{ level: RainLevel; mm: number; district: string } | null>(null)
  useEffect(() => {
    let alive = true
    const s = stops.find((x) => x.stopId === focusStopId)
    if (!s) {
      setRain(null)
      return
    }
    getWeather()
      .then((w) => {
        if (!alive) return
        const district = nearestDistrict(s.lat, s.lng)
        const mm = w.rainfall[district] ?? 0
        const level = rainLevel(mm)
        setRain(level === 'none' ? null : { level, mm, district })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [focusStopId, stops])

  // 此路線途經地區有冇交通消息(地圖角落 chip)
  const [incidents, setIncidents] = useState(0)
  useEffect(() => {
    let alive = true
    fetchTrafficNews()
      .then((n) => alive && setIncidents(relevantNotices(n, routeDistricts(stops)).length))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [stops])

  const disclaimer = disclaimerOf(route.co)
  const touchHint = touch ? ` · ${TOUCH_MAP_HINT}` : ''

  // 未有線:佔返地圖一樣高,下面站列唔會突然跳(Safari 冇 scroll anchoring)
  if (!line)
    return (
      <div className="route-map-wrap">
        <div className="map muted" style={PLACEHOLDER_STYLE} role="status">
          載入路線地圖…
        </div>
        <div className="map-disclaimer">
          {disclaimer}
          {touchHint}
        </div>
      </div>
    )

  return (
    <div className="route-map-wrap">
      <div className="map-stage">
        <MapContainer
          className="map"
          center={positions[0]}
          zoom={14}
          scrollWheelZoom={false}
          dragging={!touch}
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} />
          <MapFocus bounds={bounds} focus={focus} />
          <Polyline positions={positions} pathOptions={LINE_STYLE} />
          <StopMarkers stops={stops} focusStopId={focusStopId} />
          {etaBySeq && etaBySeq.size > 0 && snapped.length > 0 && (
            <BusLayer line={line} snapped={snapped} etaBySeq={etaBySeq} />
          )}
        </MapContainer>
        {incidents > 0 && (
          <div className="map-incident-chip">
            <span aria-hidden="true">🚧</span> 沿途 {incidents} 則交通消息
          </div>
        )}
        {rain && (
          <div className={`rain-overlay rain-${rain.level}`}>
            <div className="rain-chip">
              <span aria-hidden="true">🌧</span> {rain.district} {rainLabel[rain.level]} · 過去1小時 {rain.mm}
              mm
            </div>
          </div>
        )}
      </div>
      <div className="map-disclaimer">
        {disclaimer}
        {source === 'osrm' && ' · 路線為道路推算(OSRM)'}
        {route.co !== 'lrt' && source === 'straight' && ' · 路線用站點直線(未有行車幾何)'}
        {touchHint}
      </div>
    </div>
  )
}
