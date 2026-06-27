import { useEffect, useMemo, useState } from 'react'
import { fetchTrafficNews, type Notice } from '../api/stn'
import { routeDistricts, relevantNotices } from '../lib/stnMatch'

export default function TrafficAlert({ stops }: { stops: { lat: number; lng: number }[] }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    fetchTrafficNews()
      .then((n) => alive && setNotices(n))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const relevant = useMemo(() => {
    if (notices.length === 0 || stops.length === 0) return []
    return relevantNotices(notices, routeDistricts(stops))
  }, [notices, stops])

  if (relevant.length === 0) return null

  return (
    <div className="traffic-alert">
      <button className="ta-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        🚧 沿途地區有 {relevant.length} 則交通消息 · 如受影響可考慮轉乘
        <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="ta-list">
          {relevant.slice(0, 6).map((n) => (
            <li key={n.id || n.detail} className="ta-item">
              {n.heading && <div className="ta-title">{n.heading}</div>}
              <div className="ta-detail">{n.detail}</div>
              <div className="muted small">
                {n.districts.join('、')} {n.date && `· ${n.date}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
