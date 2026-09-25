// 智能首頁:依時段/星期推薦你常搭嘅路線(本機統計,唔上傳)。
import { useMemo } from 'react'
import { coClass, coLabel, indexRoutes, pickRoute, routeKeyOf, type Route } from '../api/bus'
import { suggest } from '../lib/usage'

interface Props {
  routes: Route[]
  onOpen: (r: Route, stopId?: string) => void
}

export default function SmartSuggest({ routes, onOpen }: Props) {
  const items = useMemo(() => {
    if (!routes.length) return []
    // 同 key 可能多條(GMB 同號跨區、嶼巴變體)→ 有 uid 用 uid 對返,唔好「最後一條贏」
    const idx = indexRoutes(routes)
    const seen = new Set<string>()
    return suggest()
      .map((s) => ({ s, r: pickRoute(idx, { ...s, bound: s.bound as 'I' | 'O' }) }))
      .flatMap(({ s, r }) => {
        if (!r) return []
        // 舊記錄冇 uid、新記錄有 → 可能對到同一條線,唔好出兩張一樣嘅卡
        const id = `${routeKeyOf(r)}|${r.uid ?? ''}`
        if (seen.has(id)) return []
        seen.add(id)
        return [{ s, r, id }]
      })
  }, [routes])

  if (!items.length) return null

  return (
    <div className="suggest">
      <div className="section-title">
        <span aria-hidden="true">🐼</span> 依你習慣,呢個時間通常搭…
      </div>
      <div className="suggest-row">
        {items.map(({ s, id, r }) => (
          <button key={id} className="suggest-card" onClick={() => onOpen(r, s.stopId)}>
            <span className={`route-badge sm ${coClass(r.co)}`}>{r.route}</span>
            <span className="suggest-info">
              <span className="muted small">{coLabel(r.co)} 往</span>
              <span className="suggest-dest">{r.dest_tc}</span>
            </span>
            <span className="chev" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
