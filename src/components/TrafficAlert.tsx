import { useEffect, useId, useMemo, useState } from 'react'
import { fetchTrafficNews, type Notice } from '../api/stn'
import { routeDistricts, relevantNotices } from '../lib/stnMatch'

export default function TrafficAlert({ stops }: { stops: { lat: number; lng: number }[] }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const [open, setOpen] = useState(false)
  const listId = useId()

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
      <button
        type="button"
        className="ta-head"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          <span aria-hidden="true">🚧 </span>沿途地區有 {relevant.length} 則交通消息 · 如受影響可考慮轉乘
        </span>
        <span className="chev" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <ul className="ta-list" id={listId}>
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
