import { useEffect, useState } from 'react'
import { getStopMap } from '../lib/store'
import { distanceMeters, formatDistance, getPosition } from '../lib/geo'
import StopEtaPanel from './StopEtaPanel'

interface NearStop {
  stopId: string
  name: string
  dist: number
}

export default function NearbyView() {
  const [stops, setStops] = useState<NearStop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openStop, setOpenStop] = useState<string | null>(null)

  const locate = async () => {
    setLoading(true)
    setError(null)
    try {
      const [pos, stopMap] = await Promise.all([getPosition(), getStopMap()])
      const { latitude, longitude } = pos.coords
      const near = [...stopMap.values()]
        .map((s) => ({
          stopId: s.stop,
          name: s.name_tc,
          dist: distanceMeters(latitude, longitude, Number(s.lat), Number(s.long)),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 15)
      setStops(near)
      if (near[0]) setOpenStop(near[0].stopId)
    } catch (e) {
      const isGeoErr =
        typeof e === 'object' && e !== null && 'code' in e
      const msg = isGeoErr
        ? '無法取得定位,請允許瀏覽器使用位置權限'
        : e instanceof Error
          ? e.message
          : '定位失敗'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    locate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div className="nearby-head">
        <h2 className="section-title">📍 附近車站</h2>
        <button className="back-btn" onClick={locate}>
          ↻ 重新定位
        </button>
      </div>

      {loading && <div className="muted pad">取得位置中…</div>}
      {error && <div className="error pad">⚠️ {error}</div>}

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
