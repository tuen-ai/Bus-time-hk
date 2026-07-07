// 附近 24/7 Fitness 分店:地圖 + 距離排序清單 + 一撳「帶我去」入行程規劃。
// 分店資料 build-time 由 OpenStreetMap bake(© OSM contributors,ODbL)。
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { TILE_URL, TILE_ATTRIB } from '../lib/mapConfig'
import { getPosition, describeGeoError, distanceMeters, formatDistance } from '../lib/geo'
import { MascotState } from './Mascots'

export interface FitnessBranch {
  n: string
  en: string
  lat: number
  lng: number
  addr: string
}

export interface PlanTo {
  label: string
  lat: number
  lng: number
}

const gymIcon = (active: boolean) =>
  L.divIcon({
    className: 'gym-icon',
    html: `<div class="gym ${active ? 'on' : ''}">🏋️</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, 16, { duration: 0.5 })
  }, [target, map])
  return null
}

let cache: FitnessBranch[] | null | undefined // undefined=未載,null=冇檔

export default function FitnessView({ onPlanTo }: { onPlanTo: (t: PlanTo) => void }) {
  const [branches, setBranches] = useState<FitnessBranch[] | null | undefined>(cache)
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null)
  const [geoErr, setGeoErr] = useState<string | null>(null)
  const [focus, setFocus] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (cache !== undefined) return
    fetch('./fitness.json')
      .then((r) => (r.ok ? (r.json() as Promise<FitnessBranch[]>) : null))
      .then((d) => {
        cache = d
        setBranches(d)
      })
      .catch(() => {
        cache = null
        setBranches(null)
      })
  }, [])

  useEffect(() => {
    getPosition()
      .then((p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }))
      .catch((e) => setGeoErr(describeGeoError(e)))
  }, [])

  const sorted = useMemo(() => {
    if (!branches) return []
    const withDist = branches.map((b) => ({
      ...b,
      dist: me ? distanceMeters(me.lat, me.lng, b.lat, b.lng) : null,
    }))
    return withDist.sort((a, b) => (a.dist ?? 9e9) - (b.dist ?? 9e9)).slice(0, 12)
  }, [branches, me])

  if (branches === undefined) return <MascotState mood="busy" text="載入分店資料…" />
  if (branches === null || branches.length === 0)
    return <MascotState mood="sad" text="24/7 Fitness 分店資料暫時未有,遲啲再試~" />

  const center: [number, number] = me ? [me.lat, me.lng] : [22.32, 114.17]

  return (
    <div>
      <div className="tsm-map-wrap" style={{ marginBottom: 10 }}>
        <MapContainer center={center} zoom={me ? 14 : 11} className="map tsm-map" scrollWheelZoom={false} attributionControl={false}>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} />
          <FlyTo target={focus} />
          {me && (
            <CircleMarker center={[me.lat, me.lng]} radius={8} pathOptions={{ color: '#ff4f95', fillColor: '#ff8fc0', fillOpacity: 0.9 }} />
          )}
          {sorted.map((b) => (
            <Marker
              key={`${b.lat},${b.lng}`}
              position={[b.lat, b.lng]}
              icon={gymIcon(focus?.[0] === b.lat && focus?.[1] === b.lng)}
              eventHandlers={{ click: () => setFocus([b.lat, b.lng]) }}
            />
          ))}
        </MapContainer>
      </div>
      {geoErr && <div className="muted small" style={{ marginBottom: 8 }}>⚠️ {geoErr}(清單未能按距離排)</div>}

      <ul className="nearby-list">
        {sorted.map((b) => (
          <li key={`${b.lat},${b.lng}`}>
            <div className="nearby-row" style={{ cursor: 'default' }}>
              <button
                className="gym-pick"
                aria-label="喺地圖顯示"
                onClick={() => setFocus([b.lat, b.lng])}
              >
                🏋️
              </button>
              <span className="nearby-info">
                <span className="nearby-dest">{b.n}</span>
                <span className="muted small">
                  {b.addr || b.en}
                  {b.dist != null && <> · {formatDistance(b.dist)}</>}
                </span>
              </span>
              <button
                className="goto-btn"
                onClick={() => onPlanTo({ label: `🏋️ ${b.n}`, lat: b.lat, lng: b.lng })}
              >
                🧭 帶我去
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="small muted" style={{ textAlign: 'center' }}>
        分店資料 © OpenStreetMap contributors · 或有遺漏,以官方為準
      </p>
    </div>
  )
}
