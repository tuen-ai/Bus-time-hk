import { useState } from 'react'
import { nearbyBuses, type NearbyRow } from '../lib/nearby'
import { getPosition, describeGeoError, formatDistance } from '../lib/geo'

type Status = 'idle' | 'locating' | 'ready' | 'error'

const minsLabel = (m: number) => (m <= 0 ? '即將' : `${m}`)

export default function NearbyView({ onOpen }: { onOpen: (r: NearbyRow) => void }) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<NearbyRow[]>([])

  const locate = async () => {
    setStatus('locating')
    setError(null)
    try {
      const pos = await getPosition()
      const r = await nearbyBuses(pos.coords.latitude, pos.coords.longitude)
      setRows(r)
      setStatus('ready')
    } catch (e) {
      setError(describeGeoError(e))
      setStatus('error')
    }
  }

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
        <h2 className="section-title">📍 附近巴士</h2>
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
                <span className={`nearby-min ${r.mins <= 3 ? 'soon' : ''}`}>{minsLabel(r.mins)}</span>
                <span className="muted small">分鐘</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
