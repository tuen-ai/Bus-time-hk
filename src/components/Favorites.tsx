// 首頁收藏:所有收藏路線一個 loop 一齊攞 ETA(唔係每張卡各自輪詢),背景分頁自動暫停。
// 每張卡攞到就即刻出:一條慢線(等緊 timeout,九巴最多 20 秒、其他 12 秒)唔會拖住其他卡。
// 網絡唔穩:每張卡各自保留上次成功嘅班次最多 5 分鐘(加細提示),從未成功過先顯示錯誤。
// 🚶 步行時間:每張卡自己設(唔使 GPS),設咗就標邊班趕唔切、最遲幾時出門。
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import {
  FAVS_CHANGED,
  favKey,
  getFavorites,
  setFavoriteWalk,
  toggleFavorite,
  type Favorite,
} from '../lib/store'
import { validWalk } from '../lib/catchable'
import { coClass, getEta, type Eta } from '../api/bus'
import { usePolling } from '../hooks/usePolling'
import { favToRoute } from '../lib/favRoute'
import { friendlyError } from '../lib/http'
import { ageSnapshot, keepStale, nextEtas, type EtaSnapshot } from '../lib/time'
import EtaList, { EtaError, EtaSkeleton } from './EtaList'

const REFRESH_MS = 5_000
// 步行時間快揀(分鐘)
const WALK_PRESETS = [2, 5, 8, 12]

type Result = { etas: Eta[] } | { error: string }

/** 移除收藏前:焦點搬去下一張(冇就上一張)卡嘅 .fav-open;冇卡就返首頁掣(唔用搜尋框:手機會彈鍵盤) */
function focusNeighbour(btn: HTMLElement) {
  const card = btn.closest('.fav-card')
  const target =
    card?.nextElementSibling?.querySelector<HTMLElement>('.fav-open') ??
    card?.previousElementSibling?.querySelector<HTMLElement>('.fav-open') ??
    document.querySelector<HTMLElement>('.topbar-home')
  target?.focus()
}

/**
 * 每張卡 ageSnapshot 一次(太舊嗰張變返 skeleton / 錯誤),已經唔再收藏嘅卡順手清走;
 * 全部冇變就回原本 object,唔使重畫
 */
function ageRows(
  prev: Record<string, EtaSnapshot>,
  now: number,
  keep: ReadonlySet<string>,
): Record<string, EtaSnapshot> {
  let changed = false
  const next: Record<string, EtaSnapshot> = {}
  for (const [k, r] of Object.entries(prev)) {
    const aged = keep.has(k) ? ageSnapshot(r, now) : null
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
  // 邊張卡打開緊步行時間快揀(一次一張)
  const [walkOpen, setWalkOpen] = useState<string | null>(null)
  const idBase = useId()

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
    const keys = new Set(favs.map(favKey))
    setRows((prev) => ageRows(prev, startedAt, keys))
    // 每張卡返就即刻更新(唔等 Promise.all 全部返);回傳嘅 promise 等齊先完 → usePolling 唔會疊轉
    await Promise.all(
      favs.map(async (f) => {
        const k = favKey(f)
        let r: Result
        try {
          r = { etas: await getEta(favToRoute(f), f.stopId) }
        } catch (e) {
          r = { error: friendlyError(e) }
        }
        if (seq !== seqRef.current) return // 已經有新一轉:呢張遲返嘅唔要
        const now = Date.now()
        // 失敗嗰張卡用返上次成功嘅班次(keepStale 會去走過咗嘅、超過 5 分鐘就掉);每次都係新 object → 分鐘數照重計
        setRows((prev) => ({
          ...prev,
          [k]: 'etas' in r ? { etas: r.etas, fetchedAt: now, error: null } : keepStale(prev[k], r.error, now),
        }))
      }),
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
      {favs.map((f, i) => {
        const k = favKey(f)
        const row = rows[k]
        const walk = validWalk(f.walkMins)
        const open = walkOpen === k
        const chipId = `${idBase}-walk-${i}`
        const presetsId = `${chipId}-presets`
        // 揀完 / Esc:收埋快揀,焦點返去 🚶 掣(唔好跌落 body)
        const closeWalk = () => {
          setWalkOpen(null)
          document.getElementById(chipId)?.focus()
        }
        const pickWalk = (mins: number | null) => {
          setFavs(setFavoriteWalk(k, mins))
          closeWalk()
        }
        // 自己處理咗 Esc → preventDefault,返回層(useBackLayer)唔好再關多層;輸入法選字中唔理
        const onWalkEsc = (e: KeyboardEvent<HTMLElement>) => {
          if (!open || e.key !== 'Escape' || e.nativeEvent.isComposing || e.keyCode === 229) return
          e.preventDefault()
          closeWalk()
        }
        return (
          <div key={k} className="fav-card">
            <div className="fav-head has-walk">
              <button className="fav-open" onClick={() => onOpen(f)}>
                <span className={`route-badge sm ${coClass(f.co)}`}>{f.route}</span>
                <div className="fav-info">
                  <div className="stop-name">{f.stopName}</div>
                  <div className="muted small">
                    往 {f.dest} <span aria-hidden="true">›</span>
                  </div>
                </div>
              </button>
              <button
                type="button"
                id={chipId}
                className={`walk-chip ${walk ? 'set' : ''}`}
                aria-expanded={open}
                aria-controls={open ? presetsId : undefined}
                aria-label={
                  walk
                    ? `步行 ${walk}分,改步行時間(${f.route} ${f.stopName})`
                    : `設定步行時間(${f.route} ${f.stopName})`
                }
                onClick={() => setWalkOpen(open ? null : k)}
                onKeyDown={onWalkEsc}
              >
                <span aria-hidden="true">🚶</span>
                {walk ? `${walk}分` : '＋'}
              </button>
              <button
                className="star on"
                aria-label={`移除收藏 ${f.route} ${f.stopName}`}
                onClick={(e) => {
                  // 移除咗就收埋快揀:之後再加返收藏唔好自己彈開
                  if (open) setWalkOpen(null)
                  // ★ 會連張卡一齊消失 → 焦點先搬去隔籬卡(其他卡有 key,DOM 唔會換),唔好跌落 body
                  if (document.activeElement === e.currentTarget) focusNeighbour(e.currentTarget)
                  setFavs(toggleFavorite(f))
                }}
              >
                ★
              </button>
            </div>
            {open && (
              <div
                id={presetsId}
                className="preset-chips walk-presets"
                role="group"
                aria-label={`行去${f.stopName}要幾耐`}
                onKeyDown={onWalkEsc}
              >
                <span className="walk-q" aria-hidden="true">
                  行去車站要幾耐?(估算)
                </span>
                {WALK_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`preset-chip ${walk === m ? 'on' : ''}`}
                    aria-pressed={walk === m}
                    onClick={() => pickWalk(m)}
                  >
                    {m} 分
                  </button>
                ))}
                <button type="button" className="preset-chip" onClick={() => pickWalk(null)}>
                  清除
                </button>
              </div>
            )}
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
                walkMins={walk}
              />
            )}
          </div>
        )
      })}
    </section>
  )
}
