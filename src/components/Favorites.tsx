// 首頁收藏:所有收藏路線一個 loop 一齊攞 ETA(唔係每張卡各自輪詢),背景分頁自動暫停。
// 網絡唔穩:每張卡各自保留上次成功嘅班次最多 5 分鐘(加細提示),從未成功過先顯示錯誤。
import { useEffect, useRef, useState } from 'react'
import { FAVS_CHANGED, favKey, getFavorites, toggleFavorite, type Favorite } from '../lib/store'
import { coClass, getEta, type Eta } from '../api/bus'
import { usePolling } from '../hooks/usePolling'
import { favToRoute } from '../lib/favRoute'
import { friendlyError } from '../lib/http'
import { ageSnapshot, keepStale, nextEtas, type EtaSnapshot } from '../lib/time'
import EtaList, { EtaError, EtaSkeleton } from './EtaList'

const REFRESH_MS = 5_000

type Result = { etas: Eta[] } | { error: string }

/** 每張卡 ageSnapshot 一次(太舊嗰張變返 skeleton / 錯誤);全部冇變就回原本 object,唔使重畫 */
function ageRows(prev: Record<string, EtaSnapshot>, now: number): Record<string, EtaSnapshot> {
  let changed = false
  const next: Record<string, EtaSnapshot> = {}
  for (const [k, r] of Object.entries(prev)) {
    const aged = ageSnapshot(r, now)
    if (aged !== r) changed = true
    if (aged) next[k] = aged
  }
  return changed ? next : prev
}

export default function Favorites({ onOpen }: { onOpen: (f: Favorite) => void }) {
  const [favs, setFavs] = useState<Favorite[]>(getFavorites)
  const [rows, setRows] = useState<Record<string, EtaSnapshot>>({})
  // 每轉 load 一個號碼:遲返嘅舊一轉(收藏改咗 / 撳咗刷新)唔好蓋過新結果
  const seqRef = useRef(0)

  // 設定入面改咗次序 → 重讀
  useEffect(() => {
    const onChange = () => setFavs(getFavorites())
    window.addEventListener(FAVS_CHANGED, onChange)
    return () => window.removeEventListener(FAVS_CHANGED, onChange)
  }, [])

  const load = async () => {
    const seq = ++seqRef.current
    // 背景分頁返嚟 / 斷咗網一排:等緊新資料嗰陣,走咗嘅車唔好照顯示,超過 5 分鐘嘅卡唔再顯示舊班次
    const startedAt = Date.now()
    setRows((prev) => ageRows(prev, startedAt))
    const results = await Promise.all(
      favs.map(async (f): Promise<[string, Result]> => {
        try {
          return [favKey(f), { etas: await getEta(favToRoute(f), f.stopId) }]
        } catch (e) {
          return [favKey(f), { error: friendlyError(e) }]
        }
      }),
    )
    if (seq !== seqRef.current) return
    const now = Date.now()
    // 失敗嗰張卡用返上次成功嘅班次(keepStale 會去走過咗嘅、超過 5 分鐘就掉);每次都係新 object → 分鐘數照重計
    setRows((prev) =>
      Object.fromEntries(
        results.map(([k, r]): [string, EtaSnapshot] => [
          k,
          'etas' in r ? { etas: r.etas, fetchedAt: now, error: null } : keepStale(prev[k], r.error, now),
        ]),
      ),
    )
  }
  // 收藏清單變咗(加/減)就即刻重攞
  usePolling(load, REFRESH_MS, { enabled: favs.length > 0, key: favs.map(favKey).join(',') })

  if (favs.length === 0) return null

  return (
    <section className="favs">
      <h2 className="section-title">
        <span aria-hidden="true">★ </span>收藏
      </h2>
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
                  <div className="muted small">
                    往 {f.dest} <span aria-hidden="true">›</span>
                  </div>
                </div>
              </button>
              <button className="star on" aria-label="移除收藏" onClick={() => setFavs(toggleFavorite(f))}>
                ★
              </button>
            </div>
            {!row ? (
              <EtaSkeleton />
            ) : row.fetchedAt == null ? (
              <EtaError message={row.error ?? '載入失敗'} onRetry={() => void load()} />
            ) : (
              <EtaList
                route={favToRoute(f)}
                etas={nextEtas(row.etas)}
                updatedAt={row.fetchedAt}
                stale={row.error != null}
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
