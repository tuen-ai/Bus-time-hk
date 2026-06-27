import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import { getStopMap } from '../lib/store'
import { distanceMeters, formatDistance, getPosition, describeGeoError } from '../lib/geo'
import { userIcon, stopIcon, stopIconActive } from '../lib/mapIcons'
import { TILE_URL, TILE_ATTRIB } from '../lib/mapConfig'
import StopEtaPanel from './StopEtaPanel'

interface NearStop {
  stopId: string
  name: string
  lat: number
  lng: number
  dist: number
}

type Status = 'idle' | 'locating' | 'ready' | 'error'

// 揀咗站就 zoom 去該站(只喺 focus 改變時行,唔阻用戶自己拖)
function Focus({ focus }: { focus: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (focus) map.flyTo(focus, 17, { duration: 0.6 })
  }, [focus, map])
  return null
}

export default function NearbyView() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null)
  const [stops, setStops] = useState<NearStop[]>([])
  const [openStop, setOpenStop] = useState<string | null>(null)

  const locate = async () => {
    setStatus('locating')
    setError(null)
    try {
      const [pos, stopMap] = await Promise.all([getPosition(), getStopMap()])
      const { latitude, longitude } = pos.coords
      const near = [...stopMap.values()]
        .map((s) => ({
          stopId: s.stop,
          name: s.name_tc,
          lat: Number(s.lat),
          lng: Number(s.long),
          dist: distanceMeters(latitude, longitude, Number(s.lat), Number(s.long)),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 20)
      setMe({ lat: latitude, lng: longitude })
      setStops(near)
      setOpenStop(near[0]?.stopId ?? null)
      setStatus('ready')
    } catch (e) {
      setError(describeGeoError(e))
      setStatus('error')
    }
  }

  const focusPos = useMemo<[number, number] | null>(() => {
    const s = stops.find((x) => x.stopId === openStop)
    return s ? [s.lat, s.lng] : null
  }, [openStop, stops])

  // 未定位:顯示一個大掣(用戶 gesture 觸發,手機先彈到權限)
  if (status === 'idle' || status === 'error') {
    return (
      <div className="nearby-cta">
        <div className="cta-emoji">📍</div>
        <p className="muted">睇下你附近有咩巴士站同即時到站</p>
        {status === 'error' && error && <div className="error pad">⚠️ {error}</div>}
        <button className="primary-btn" onClick={locate}>
          {status === 'error' ? '重新定位' : '顯示附近車站'}
        </button>
        <p className="small muted" style={{ marginTop: 12 }}>
          需要允許瀏覽器使用你嘅位置;位置只會喺你部機上運算,唔會上傳。
        </p>
      </div>
    )
  }

  if (status === 'locating') {
    return <div className="muted pad">📡 取得位置中…</div>
  }

  return (
    <div>
      <div className="nearby-head">
        <h2 className="section-title">📍 附近車站</h2>
        <button className="back-btn" onClick={locate}>
          ↻ 重新定位
        </button>
      </div>

      {me && (
        <MapContainer
          center={[me.lat, me.lng]}
          zoom={16}
          className="map"
          scrollWheelZoom
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} />
          <Focus focus={focusPos} />
          <Marker position={[me.lat, me.lng]} icon={userIcon} />
          {stops.map((s) => (
            <Marker
              key={s.stopId}
              position={[s.lat, s.lng]}
              icon={openStop === s.stopId ? stopIconActive : stopIcon}
              eventHandlers={{ click: () => setOpenStop(s.stopId) }}
            />
          ))}
        </MapContainer>
      )}

      <ol className="stop-list">
        {stops.map((s) => {
          const open = openStop === s.stopId
          return (
            <li key={s.stopId} className={`stop-item ${open ? 'open' : ''}`}>
              <button
                className="stop-main"
                onClick={() => setOpenStop(open ? null : s.stopId)}
              >
                <span className="stop-name">{s.name}</span>
                <span className="muted small">{formatDistance(s.dist)}</span>
                <span className="chev">{open ? '▾' : '▸'}</span>
              </button>
              {open && <StopEtaPanel stopId={s.stopId} />}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
