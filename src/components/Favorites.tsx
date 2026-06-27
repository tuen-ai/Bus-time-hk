import { useState } from 'react'
import { getFavorites, toggleFavorite, type Favorite } from '../lib/store'
import EtaPanel from './EtaPanel'

export default function Favorites() {
  const [favs, setFavs] = useState<Favorite[]>(getFavorites())

  if (favs.length === 0) return null

  return (
    <section className="favs">
      <h2 className="section-title">★ 收藏</h2>
      {favs.map((f) => (
        <div key={`${f.route}|${f.bound}|${f.serviceType}|${f.stopId}`} className="fav-card">
          <div className="fav-head">
            <span className="route-badge sm">{f.route}</span>
            <div className="fav-info">
              <div className="stop-name">{f.stopName}</div>
              <div className="muted small">往 {f.dest}</div>
            </div>
            <button
              className="star on"
              aria-label="移除收藏"
              onClick={() => setFavs(toggleFavorite(f))}
            >
              ★
            </button>
          </div>
          <EtaPanel stopId={f.stopId} route={f.route} serviceType={f.serviceType} />
        </div>
      ))}
    </section>
  )
}
