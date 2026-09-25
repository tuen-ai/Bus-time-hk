// 首頁港鐵收藏(站 + 方向):同一個站只攞一次時間表(兩個方向都收藏都係一個請求),每 15 秒刷新,背景分頁暫停。
// 網絡唔穩同巴士收藏一樣:每個站各自保留上次成功嘅時間表最多 5 分鐘(分鐘數照扣),從未成功先出錯。
// ⚠️ 延誤 / 特別車務安排直接睇嗰個站自己個回應,唔使額外請求。
// 唔好 import MtrView / Leaflet:呢個喺首頁 bundle,鐵路頁要揀咗先載。
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { fetchSchedule, type StationSchedule } from '../api/mtr'
import { getLine, stationNameTc } from '../lib/mtrData'
import {
  ageMtrSnap,
  freshMtrSnap,
  getMtrFavs,
  keepMtrStale,
  MTR_FAVS_KEY,
  MTRFAVS_CHANGED,
  mtrFavKey,
  mtrStaKey,
  toggleMtrFav,
  ttntLabel,
  upcomingTrains,
  type MtrFav,
  type MtrSnap,
} from '../lib/mtrFavs'
import { usePolling } from '../hooks/usePolling'
import { friendlyError } from '../lib/http'
import { clockLabel } from '../lib/time'
import { EtaError, EtaSkeleton } from './EtaList'

const REFRESH_MS = 15_000
const SHOW_TRAINS = 2

type Result = { sched: StationSchedule } | { error: string }

/** 每個站 ageMtrSnap 一次,唔再收藏嘅站順手清走;全部冇變就回原本 object,唔使重畫 */
function ageRows(
  prev: Record<string, MtrSnap>,
  now: number,
  keep: ReadonlySet<string>,
): Record<string, MtrSnap> {
  let changed = false
  const next: Record<string, MtrSnap> = {}
  for (const [k, r] of Object.entries(prev)) {
    const aged = keep.has(k) ? ageMtrSnap(r, now) : undefined
    if (aged !== r) changed = true
    if (aged) next[k] = aged
  }
  return changed ? next : prev
}

const hhmm = (ms: number) => clockLabel(new Date(ms).toISOString())
const staName = (code: string) => stationNameTc[code] ?? code

export default function MtrFavorites({ onOpen }: { onOpen: (line: string, sta: string) => void }) {
  const [favs, setFavs] = useState<MtrFav[]>(getMtrFavs)
  const [rows, setRows] = useState<Record<string, MtrSnap>>({})
  // 每轉 load 一個號碼:遲返嘅舊一轉唔好蓋過新結果
  const seqRef = useRef(0)

  // 鐵路頁撳 ☆ / 另一個分頁改咗 → 重讀
  useEffect(() => {
    const onChange = () => setFavs(getMtrFavs())
    const onStorage = (e: StorageEvent) => {
      if (e.key == null || e.key === MTR_FAVS_KEY) onChange()
    }
    window.addEventListener(MTRFAVS_CHANGED, onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(MTRFAVS_CHANGED, onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // 同一個站兩個方向都收藏:一個請求搞掂
  const stations = useMemo(
    () => favs.filter((f, i) => favs.findIndex((x) => mtrStaKey(x) === mtrStaKey(f)) === i),
    [favs],
  )
  const staKeys = useMemo(() => stations.map(mtrStaKey), [stations])

  const load = useCallback(async () => {
    const seq = ++seqRef.current
    const startedAt = Date.now()
    setRows((prev) => ageRows(prev, startedAt, new Set(staKeys)))
    // 每個站返就即刻更新;回傳嘅 promise 等齊先完 → usePolling 唔會疊轉
    await Promise.all(
      stations.map(async (s) => {
        const k = mtrStaKey(s)
        let r: Result
        try {
          r = { sched: await fetchSchedule(s.line, s.sta) }
        } catch (e) {
          r = { error: friendlyError(e) }
        }
        if (seq !== seqRef.current) return
        const now = Date.now()
        setRows((prev) => ({
          ...prev,
          [k]: 'sched' in r ? freshMtrSnap(r.sched, now) : keepMtrStale(prev[k], r.error, now),
        }))
      }),
    )
  }, [stations, staKeys])
  usePolling(load, REFRESH_MS, { enabled: stations.length > 0, key: staKeys.join(',') })

  if (favs.length === 0) return null

  return (
    <section className="favs mtr-favs">
      <h2 className="section-title">
        <span aria-hidden="true">🚇 </span>港鐵收藏
      </h2>
      {favs.map((f) => {
        const line = getLine(f.line)
        if (!line) return null
        const name = staName(f.sta)
        const snap = rows[mtrStaKey(f)]
        const sched = snap?.sched
        const trains =
          sched && snap.fetchedAt != null && !sched.special
            ? upcomingTrains(f.dir === 'UP' ? sched.up : sched.down, snap.at - snap.fetchedAt, SHOW_TRAINS)
            : []
        // 目的地睇實時回應(唔存:機場快綫 / 東鐵綫每班可以唔同)
        const dest = trains[0] ? staName(trains[0].dest) : null
        const stale = snap?.fetchedAt != null && snap.error != null
        return (
          <div
            key={mtrFavKey(f)}
            className="fav-card mtr-fav"
            style={{ '--line-c': line.color } as CSSProperties}
          >
            <div className="fav-head">
              <button type="button" className="fav-open" onClick={() => onOpen(f.line, f.sta)}>
                <span className="mtr-fav-badge" aria-hidden="true">
                  🚇
                </span>
                <div className="fav-info">
                  <div className="stop-name">{name}</div>
                  <div className="muted small">
                    {line.nameTc}
                    {dest && ` · 往${dest}`} <span aria-hidden="true">›</span>
                  </div>
                </div>
              </button>
              <button
                type="button"
                className="star on"
                aria-label={`移除港鐵收藏 ${line.nameTc} ${name}${dest ? ` 往${dest}` : ''}`}
                onClick={() => setFavs(toggleMtrFav(f))}
              >
                ★
              </button>
            </div>
            {!snap ? (
              <EtaSkeleton />
            ) : !sched || snap.fetchedAt == null ? (
              <EtaError message={snap.error ?? '載入失敗'} onRetry={() => void load()} />
            ) : (
              <div className={`eta-panel mtr-fav-body ${stale ? 'stale' : ''}`}>
                {stale && (
                  <div className="eta-stale">
                    <span aria-hidden="true">📶 </span>網絡唔穩 · 顯示緊 {hhmm(snap.fetchedAt)} 嘅資料 ·
                    重試中
                  </div>
                )}
                {(sched.special || sched.isDelay) && (
                  <div className="mtr-fav-warn">
                    <span aria-hidden="true">⚠️ </span>
                    {sched.special ? '特別車務安排' : '班次資料顯示有延誤'}
                  </div>
                )}
                {sched.special ? (
                  // 有通告連結先叫人睇通告(鐵路頁得有 url 先出「查看車務通告」)
                  <div className="muted small">暫無實時班次 · 撳站名睇{sched.url ? '車務通告' : '詳情'}</div>
                ) : trains.length === 0 ? (
                  // 舊資料啲車走晒唔等於冇車:唔好講「暫無班次」(同巴士收藏 EtaList 一樣)
                  <div className="muted small">{stale ? '暫時攞唔到最新班次' : '此方向暫無班次'}</div>
                ) : (
                  <ul className="mtr-trains mtr-fav-trains">
                    {trains.map((t, i) => (
                      <li key={`${t.dest}-${t.plat}-${i}`} className="mtr-train">
                        <span className={`mtr-mins ${t.ttnt <= 1 ? 'soon' : ''}`}>{ttntLabel(t.ttnt)}</span>
                        {t.plat && <span className="mtr-plat">月台 {t.plat}</span>}
                        {/* 同一方向唔同目的地(例如東鐵綫羅湖 / 落馬洲)先逐班寫 */}
                        {t.dest !== trains[0].dest && <span className="mtr-plat">往{staName(t.dest)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
