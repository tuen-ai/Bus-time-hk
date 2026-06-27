import { useState } from 'react'
import { getFavorites, toggleFavorite, type Favorite } from '../lib/store'
import type { Route } from '../api/bus'
import EtaPanel from './EtaPanel'

const favToRoute = (f: Favorite): Route => ({
  co: f.co,
  route: f.route,
  bound: f.bound,
  service_type: f.serviceType,
  orig_tc: '',
  dest_tc: f.dest,
})

export default function Favorites({ onOpen }: { onOpen: (f: Favorite) => void }) {
  const [favs, setFavs] = useState<Favorite[]>(getFavorites())

  if (favs.length === 0) return null

  return (
    <section className="favs">
      <h2 className="section-title">★ 收藏</h2>
      {favs.map((f) => (
        <div key={`${f.co}|${f.route}|${f.bound}|${f.serviceType}|${f.stopId}`} className="fav-card">
          <div className="fav-head">
            <button className="fav-open" onClick={() => onOpen(f)}>
              <span className={`route-badge sm ${f.co === 'ctb' ? 'co-ctb' : ''}`}>{f.route}</span>
              <div className="fav-info">
                <div className="stop-name">{f.stopName}</div>
                <div className="muted small">往 {f.dest} ›</div>
              </div>
            </button>
            <button
              className="star on"
              aria-label="移除收藏"
              onClick={() => setFavs(toggleFavorite(f))}
            >
              ★
            </button>
          </div>
          <EtaPanel route={favToRoute(f)} stopId={f.stopId} />
        </div>
      ))}
    </section>
  )
}
