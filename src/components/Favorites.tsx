// 首頁收藏:所有收藏路線一個 loop 一齊攞 ETA(唔係每張卡各自輪詢),背景分頁自動暫停。
import { useState } from 'react'
import { favKey, getFavorites, toggleFavorite, type Favorite } from '../lib/store'
import { coClass, getEta, type Eta, type Route } from '../api/bus'
import { usePolling } from '../hooks/usePolling'
import { nextEtas } from '../lib/time'
import EtaList, { EtaSkeleton } from './EtaList'

const REFRESH_MS = 5_000

const favToRoute = (f: Favorite): Route => ({
  co: f.co,
  route: f.route,
  bound: f.bound,
  service_type: f.serviceType,
  orig_tc: '',
  dest_tc: f.dest,
})

interface RowState {
  etas: Eta[]
  error?: string
}

export default function Favorites({ onOpen }: { onOpen: (f: Favorite) => void }) {
  const [favs, setFavs] = useState<Favorite[]>(getFavorites)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  const load = async () => {
    const results = await Promise.all(
      favs.map(async (f): Promise<[string, RowState]> => {
        try {
          return [favKey(f), { etas: nextEtas(await getEta(favToRoute(f), f.stopId)) }]
        } catch (e) {
          return [favKey(f), { etas: [], error: e instanceof Error ? e.message : '載入失敗' }]
        }
      }),
    )
    setRows(Object.fromEntries(results))
    setUpdatedAt(Date.now())
  }
  // 收藏清單變咗(加/減)就即刻重攞
  usePolling(load, REFRESH_MS, { enabled: favs.length > 0, key: favs.map(favKey).join(',') })

  if (favs.length === 0) return null

  return (
    <section className="favs">
      <h2 className="section-title">★ 收藏</h2>
      {favs.map((f) => {
        const k = favKey(f)
        const row = rows[k]
        return (
          <div key={k} className="fav-card">
            <div className="fav-head">
              <button className="fav-open" onClick={() => onOpen(f)}>
                <span className={`route-badge sm ${coClass(f.co)}`}>{f.route}</span>
                <div className="fav-info">
                  <div className="stop-name">{f.stopName}</div>
                  <div className="muted small">往 {f.dest} ›</div>
                </div>
              </button>
              <button className="star on" aria-label="移除收藏" onClick={() => setFavs(toggleFavorite(f))}>
                ★
              </button>
            </div>
            {!row ? (
              <EtaSkeleton />
            ) : row.error ? (
              <div className="eta-panel error">⚠️ {row.error}</div>
            ) : (
              <EtaList
                route={favToRoute(f)}
                etas={row.etas}
                updatedAt={updatedAt}
                refreshSec={REFRESH_MS / 1000}
                onRefresh={() => void load()}
              />
            )}
          </div>
        )
      })}
    </section>
  )
}
