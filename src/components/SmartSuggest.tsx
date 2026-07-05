// 智能首頁:依時段/星期推薦你常搭嘅路線(本機統計,唔上傳)。
import { useMemo } from 'react'
import { coClass, coLabel, type Route } from '../api/bus'
import { suggest } from '../lib/usage'

interface Props {
  routes: Route[]
  onOpen: (r: Route, stopId?: string) => void
}

export default function SmartSuggest({ routes, onOpen }: Props) {
  const items = useMemo(() => {
    if (!routes.length) return []
    return suggest()
      .map((s) => ({
        s,
        r: routes.find(
          (x) =>
            x.co === s.co &&
            x.route === s.route &&
            x.bound === s.bound &&
            x.service_type === s.serviceType,
        ),
      }))
      .filter((x): x is { s: (typeof x)['s']; r: Route } => !!x.r)
  }, [routes])

  if (!items.length) return null

  return (
    <div className="suggest">
      <div className="section-title">🐼 依你習慣,呢個時間通常搭…</div>
      <div className="suggest-row">
        {items.map(({ s, r }) => (
          <button
            key={`${s.co}|${s.route}|${s.bound}|${s.serviceType}`}
            className="suggest-card"
            onClick={() => onOpen(r, s.stopId)}
          >
            <span className={`route-badge sm ${coClass(r.co)}`}>{r.route}</span>
            <span className="suggest-info">
              <span className="muted small">{coLabel(r.co)} 往</span>
              <span className="suggest-dest">{r.dest_tc}</span>
            </span>
            <span className="chev">›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
