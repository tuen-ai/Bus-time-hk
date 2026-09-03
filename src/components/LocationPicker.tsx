import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { TILE_URL, TILE_ATTRIB } from '../lib/mapConfig'
import { geocode, type GeoPlace } from '../api/geocode'
import { localPlaces } from '../lib/localPlaces'

export interface PickedPlace {
  label: string
  lat: number
  lng: number
}

const HK_CENTER = { lat: 22.3193, lng: 114.1694 }

// 地圖郁完 → 更新中心座標(中心 = 所揀位置)
function CenterTracker({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    moveend: (e) => {
      const c = e.target.getCenter()
      onMove(c.lat, c.lng)
    },
  })
  return null
}

// 搜尋揀咗結果 → 飛去該位置
function FlyTo({ pos }: { pos: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (pos) map.setView(pos, 17)
  }, [pos, map])
  return null
}

interface Props {
  title: string
  initial?: PickedPlace | null
  onConfirm: (p: PickedPlace) => void
  onCancel: () => void
}

export default function LocationPicker({ title, initial, onConfirm, onCancel }: Props) {
  const start = initial ?? HK_CENTER
  const [center, setCenter] = useState({ lat: start.lat, lng: start.lng })
  const [label, setLabel] = useState(initial?.label ?? '自訂位置')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<GeoPlace[]>([])
  const [searching, setSearching] = useState(false)
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null)
  const [picked, setPicked] = useState(false) // 揀咗建議後唔再彈

  // 即打即彈建議:本地車站(即時)+ 地理編碼(debounce)
  useEffect(() => {
    if (picked) return
    const s = q.trim()
    if (s.length < 1) {
      setResults([])
      return
    }
    const local = localPlaces(s)
    setResults(local)
    setSearching(true)
    const t = setTimeout(async () => {
      const geo = await geocode(s)
      const merged = [...local]
      for (const g of geo) {
        if (!merged.some((m) => m.label === g.label)) merged.push(g)
        if (merged.length >= 8) break
      }
      setResults(merged)
      setSearching(false)
    }, 350)
    return () => clearTimeout(t)
  }, [q, picked])

  const choose = (r: GeoPlace) => {
    setLabel(r.label)
    setCenter({ lat: r.lat, lng: r.lng })
    setFlyTo([r.lat, r.lng])
    setPicked(true)
    setResults([])
    setQ(r.label)
  }

  return (
    <div className="picker">
      <button className="back-btn" onClick={onCancel}>
        ‹ 取消
      </button>
      <div className="section-title" style={{ fontSize: '1.05rem', color: 'var(--text)' }}>
        {title}
      </div>

      <div className="search">
        <input
          value={q}
          placeholder="搜尋地址或地點(例:葵芳、葵涌廣場)"
          onChange={(e) => {
            setPicked(false)
            setQ(e.target.value)
          }}
        />
        {q && (
          <button
            className="clear"
            onClick={() => {
              setPicked(false)
              setQ('')
              setResults([])
            }}
            aria-label="清除"
          >
            ✕
          </button>
        )}
      </div>

      {results.length > 0 && (
        <ul className="geo-results">
          {results.map((r, i) => (
            <li key={`${r.label}-${i}`}>
              <button className="geo-item" onClick={() => choose(r)}>
                <span className="geo-label">
                  {r.label}
                  {r.sub && <span className="geo-tag">{r.sub}</span>}
                </span>
              </button>
            </li>
          ))}
          {searching && <li className="geo-loading muted small">搜尋更多地點…</li>}
        </ul>
      )}

      <div className="map-stage">
        <MapContainer center={[center.lat, center.lng]} zoom={16} className="map" scrollWheelZoom>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} />
          <CenterTracker
            onMove={(lat, lng) => {
              setCenter({ lat, lng })
              setLabel('自訂位置(地圖)')
            }}
          />
          <FlyTo pos={flyTo} />
        </MapContainer>
        <div className="pin-fixed" aria-hidden="true">
          📍
        </div>
        <div className="maphint">拖動地圖,將 📍 對準位置</div>
      </div>

      <div className="addr-sel">
        <div className="muted small">已選位置</div>
        <div className="plan-val">{label}</div>
      </div>

      <button
        className="primary-btn full"
        onClick={() => onConfirm({ label, lat: center.lat, lng: center.lng })}
      >
        ✓ 確定此位置
      </button>
    </div>
  )
}
