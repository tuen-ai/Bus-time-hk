import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { TILE_URL, TILE_ATTRIB } from '../lib/mapConfig'
import type { GeoPlace } from '../api/geocode'
import { usePlaceSearch } from '../hooks/usePlaceSearch'

export interface PickedPlace {
  label: string
  lat: number
  lng: number
}

const HK_CENTER = { lat: 22.3193, lng: 114.1694 }

// FlyTo 嘅 setView 都會觸發 moveend;Leaflet 同 zoom 平移會 _trunc 到整數像素
// (z17 約 1.1 米 ≈ 1.07e-5°)→ 容差放 5e-5(約 5 米),停喺揀咗嘅點就當冇拖過
const SAME_SPOT = 5e-5
const atSpot = (lat: number, lng: number, spot: [number, number] | null) =>
  !!spot && Math.abs(lat - spot[0]) < SAME_SPOT && Math.abs(lng - spot[1]) < SAME_SPOT

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
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null)
  const [picked, setPicked] = useState(false) // 揀咗建議後唔再彈
  const { results, searching } = usePlaceSearch(q, picked)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // 成個規劃頁換咗做揀點畫面 —— 焦點搬去標題,唔好跌返落 <body>
  useEffect(() => titleRef.current?.focus(), [])

  const choose = (r: GeoPlace) => {
    setLabel(r.label)
    setCenter({ lat: r.lat, lng: r.lng })
    setFlyTo([r.lat, r.lng])
    setPicked(true)
    setQ(r.label)
  }

  const clearQuery = () => {
    setPicked(false)
    setQ('')
  }

  const hasList = results.length > 0
  // 讀屏:淨係讀「搵緊 / 有幾多個」,唔好每次 debounce 都讀晒成串地址
  const status =
    q.trim() && !picked
      ? searching
        ? '搜尋緊…'
        : hasList
          ? `${results.length} 個建議地點`
          : '搵唔到相關地點'
      : ''

  return (
    <section className="picker" aria-labelledby="picker-title">
      <button className="back-btn" onClick={onCancel}>
        <span aria-hidden="true">‹</span> 取消
      </button>
      <h2 id="picker-title" className="section-title picker-title" tabIndex={-1} ref={titleRef}>
        {title}
      </h2>

      <div className="search">
        <input
          type="search"
          enterKeyHint="search"
          aria-label="搜尋地址或地點"
          aria-autocomplete="list"
          aria-controls={hasList ? 'geo-results' : undefined}
          value={q}
          placeholder="搜尋地址或地點(例:葵芳、葵涌廣場)"
          onChange={(e) => {
            setPicked(false)
            setQ(e.target.value)
          }}
          onKeyDown={(e) => {
            // Esc:有字先清字(唔好一下閂埋成個揀點畫面);冇字先交返畀返回層關
            if (e.key !== 'Escape' || !q || e.nativeEvent.isComposing || e.keyCode === 229) return
            e.preventDefault()
            clearQuery()
          }}
        />
        {q && (
          <button className="clear" onClick={clearQuery} aria-label="清除">
            ✕
          </button>
        )}
      </div>
      {/* 一直掛住,內容變先會讀 */}
      <div className="sr-only" role="status" aria-live="polite">
        {status}
      </div>

      {hasList && (
        <ul className="geo-results" id="geo-results">
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
          {searching && (
            <li className="geo-loading muted small" aria-hidden="true">
              搜尋更多地點…
            </li>
          )}
        </ul>
      )}

      <div className="map-stage">
        <MapContainer center={[center.lat, center.lng]} zoom={16} className="map" scrollWheelZoom>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} />
          <CenterTracker
            onMove={(lat, lng) => {
              setCenter({ lat, lng })
              if (atSpot(lat, lng, flyTo)) return // 飛到揀咗嘅建議:保留建議名
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
        <span aria-hidden="true">✓</span> 確定此位置
      </button>
    </section>
  )
}
