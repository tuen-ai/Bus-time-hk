import { useEffect, useRef, useState } from 'react'
import { nearbyBuses, type NearbyRow } from '../lib/nearby'
import { getPosition, describeGeoError, formatDistance } from '../lib/geo'

type Status = 'idle' | 'locating' | 'ready' | 'error'

const REFRESH_MS = 5_000
const timeLabel = (m: number) => (m <= 0 ? '即將' : `${m}分`)

export default function NearbyView({ onOpen }: { onOpen: (r: NearbyRow) => void }) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<NearbyRow[]>([])
  const coords = useRef<{ lat: number; lng: number } | null>(null)

  const locate = async () => {
    setStatus('locating')
    setError(null)
    try {
      const pos = await getPosition()
      coords.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      const r = await nearbyBuses(coords.current.lat, coords.current.lng)
      setRows(r)
      setStatus('ready')
    } catch (e) {
      setError(describeGeoError(e))
      setStatus('error')
    }
  }

  // 每 5 秒用已知位置靜默刷新 ETA(唔再彈定位)
  useEffect(() => {
    if (status !== 'ready') return
    const id = setInterval(() => {
      const c = coords.current
      if (!c) return
      nearbyBuses(c.lat, c.lng)
        .then(setRows)
        .catch(() => {})
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [status])

  if (status === 'idle' || status === 'error') {
    return (
      <div className="nearby-cta">
        <div className="cta-emoji">📍</div>
        <p className="muted">睇下你附近有咩巴士就嚟到</p>
        {status === 'error' && error && <div className="error pad">⚠️ {error}</div>}
        <button className="primary-btn" onClick={locate}>
          {status === 'error' ? '重新定位' : '顯示附近巴士'}
        </button>
        <p className="small muted" style={{ marginTop: 12 }}>
          位置只喺你部機運算,唔會上傳。目前涵蓋九巴 / 龍運。
        </p>
      </div>
    )
  }

  if (status === 'locating') return <div className="muted pad">📡 搵緊附近巴士…</div>

  return (
    <div>
      <div className="nearby-head">
        <h2 className="section-title">📍 附近巴士 · 每 5 秒刷新</h2>
        <button className="back-btn" onClick={locate}>
          ↻ 重新定位
        </button>
      </div>
      {rows.length === 0 && <div className="muted pad">附近暫時無即將到站嘅班次</div>}
      <ul className="nearby-list">
        {rows.map((r, i) => (
          <li key={`${r.route}-${r.stopId}-${i}`}>
            <button className="nearby-row" onClick={() => onOpen(r)}>
              <span className="route-badge sm">{r.route}</span>
              <span className="nearby-info">
                <span className="nearby-dest">往 {r.dest}</span>
                <span className="muted small">
                  {r.stopName} · {formatDistance(r.dist)}
                </span>
              </span>
              <span className="nearby-eta">
                <span className="muted small">下一班</span>
                <span className="nearby-times">
                  <span className={`nearby-min ${(r.mins[0] ?? 99) <= 3 ? 'soon' : ''}`}>
                    {timeLabel(r.mins[0] ?? 0)}
                  </span>
                  {r.mins.length > 1 && (
                    <span className="nearby-next">
                      {r.mins.slice(1).map((m) => timeLabel(m)).join(', ')}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
