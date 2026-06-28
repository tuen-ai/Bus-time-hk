import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { TILE_URL, TILE_ATTRIB } from '../lib/mapConfig'
import { geocode, type GeoPlace } from '../api/geocode'

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

  const search = async () => {
    if (!q.trim()) return
    setSearching(true)
    try {
      setResults(await geocode(q))
    } finally {
      setSearching(false)
    }
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
          placeholder="搜尋地址或地點(例:太古城中心)"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        {q && (
          <button className="clear" onClick={() => { setQ(''); setResults([]) }} aria-label="清除">
            ✕
          </button>
        )}
      </div>

      {searching && <div className="muted pad">搜尋緊…</div>}
      {results.length > 0 && (
        <ul className="geo-results">
          {results.map((r, i) => (
            <li key={i}>
              <button
                className="geo-item"
                onClick={() => {
                  setLabel(r.label)
                  setCenter({ lat: r.lat, lng: r.lng })
                  setFlyTo([r.lat, r.lng])
                  setResults([])
                  setQ(r.label)
                }}
              >
                <span className="geo-label">{r.label}</span>
                {r.sub && <span className="muted small">{r.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="map-stage">
        <MapContainer center={[center.lat, center.lng]} zoom={16} className="map" scrollWheelZoom>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} />
          <CenterTracker onMove={(lat, lng) => { setCenter({ lat, lng }); setLabel('自訂位置(地圖)') }} />
          <FlyTo pos={flyTo} />
        </MapContainer>
        <div className="pin-fixed" aria-hidden="true">📍</div>
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
