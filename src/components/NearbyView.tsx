import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  ageRows,
  lastKnownLoc,
  nearbyBuses,
  nearbyErrorText,
  nearbyNotice,
  NEARBY_COS,
  readNearbyCache,
  readNearbyTab,
  writeNearbyCache,
  writeNearbyTab,
  type LatLng,
  type NearbyCo,
  type NearbyRow,
  type NearbyTab,
} from '../lib/nearby'
import { getPosition, describeGeoError, formatDistance, isGeoDenied } from '../lib/geo'
import { coClass, CO_COLOR, coLabel } from '../api/bus'
import { MascotState } from './Mascots'
import type { PlanTo } from './FitnessView'
import { usePolling } from '../hooks/usePolling'

// 健身房地圖(Leaflet)按需載入
const FitnessView = lazy(() => import('./FitnessView'))

// KMB 一炮一站好平;CTB 逐路線好貴 → 刷新頻率分開
const REFRESH_MS: Record<NearbyCo, number> = { kmb: 5_000, ctb: 12_000, gmb: 12_000 }
// 附近要「而家」嘅位置:瀏覽器快取位置最多收 1 分鐘;撳重新定位就要即刻嘅
const NEARBY_MAX_AGE = 60_000
const RELOCATE_MAX_AGE = 5_000
// 位置舊過 2 分鐘(一路行緊 / app 由背景返嚟)→ 輪詢時靜靜再定位
const LOC_FRESH_MS = 2 * 60_000
// 背景再定位最多等幾耐先用舊位置照刷(GPS 慢起上嚟等成 40 秒,唔好凍住到站時間)
const LOC_WAIT_MS = 3_000
const FIT_COLOR = '#7d3c98'
const timeLabel = (m: number) => (m <= 0 ? '即將' : `${m}分`)
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
// 品牌色經 --co 交俾 CSS(search.css .co-chip 按主題揀字色,深色模式都夠對比)
const coVar = (color: string) => ({ '--co': color }) as CSSProperties

export default function NearbyView({
  onOpen,
  onPlanTo,
}: {
  onOpen: (r: NearbyRow) => void
  onPlanTo: (t: PlanTo) => void
}) {
  const [tab, setTab] = useState<NearbyTab>(readNearbyTab)
  const co: NearbyCo = tab === 'fit' ? 'kmb' : tab
  const [rows, setRows] = useState<NearbyRow[]>([])
  const [stale, setStale] = useState(false) // 顯示緊上次結果
  const [oldLoc, setOldLoc] = useState(false) // 定位唔到,用緊上次位置
  const [busyN, setBusyN] = useState(0) // 定位 / 手動刷新(可以重疊,所以用計數)
  const busy = busyN > 0
  const [error, setError] = useState<string | null>(null)
  const coords = useRef<LatLng | null>(null)
  const locatedAt = useRef(0) // 上次成功定位
  const locTriedAt = useRef(0) // 上次試定位(成唔成功都計)
  const denied = useRef(false) // 權限被拒 → 背景唔再問
  const locating = useRef<{ p: Promise<LatLng>; maxAgeMs: number } | null>(null)
  // 定位序號:舊嘅(慢咗返)定位唔好蓋咗較新嘅位置
  const locSeq = useRef(0)
  const locDoneSeq = useRef(0)
  // 上次成功攞到嘅列表 + 時間:之後攞唔到就用佢照倒數
  const base = useRef<{ rows: NearbyRow[]; ts: number } | null>(null)
  // 請求序號:舊請求遲返唔好蓋咗新結果(例如重新定位後,舊位置嘅輪詢先返)
  const reqSeq = useRef(0)
  const appliedSeq = useRef(0)
  // 離開咗 tab:遲返嘅定位 / 計時唔好再發請求
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  // 而家揀緊邊個營辦商(俾 async refresh 完成後對返,唔係就丟棄結果)
  const coRef = useRef(co)
  useEffect(() => {
    coRef.current = co
  }, [co])

  const track = useCallback(async (job: () => Promise<void>) => {
    setBusyN((n) => n + 1)
    try {
      await job()
    } finally {
      setBusyN((n) => n - 1)
    }
  }, [])

  // 換營辦商:即刻俾 cache(照倒數),再靜靜攞新
  const showCoNow = useCallback((c: NearbyCo) => {
    const cached = readNearbyCache(c)
    const aged = cached ? ageRows(cached.rows, Date.now() - cached.ts) : []
    base.current = cached && aged.length ? { rows: cached.rows, ts: cached.ts } : null
    setRows(aged)
    setStale(aged.length > 0)
    setError(null)
  }, [])

  // 攞新鮮位置(cache 入面嘅舊座標唔再當係而家位置);同一時間唔好重複問
  const locate = useCallback((maxAgeMs: number): Promise<LatLng> => {
    const cur = locating.current
    if (cur && cur.maxAgeMs <= maxAgeMs) return cur.p
    locTriedAt.current = Date.now()
    const my = ++locSeq.current
    const p = getPosition({ maxAgeMs })
      .then(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          // 例如背景定位等緊 GPS 時撳咗重新定位:新嗰個先返,舊嗰個遲返就唔要
          if (my < locDoneSeq.current) return coords.current ?? loc
          locDoneSeq.current = my
          coords.current = loc
          locatedAt.current = Date.now()
          denied.current = false
          setOldLoc(false)
          return loc
        },
        (e: unknown) => {
          // 較新嘅定位已經成功咗:舊嗰個失敗唔算數(唔好標「上次位置」)
          if (my < locDoneSeq.current && coords.current) return coords.current
          denied.current = isGeoDenied(e)
          throw e
        },
      )
      .finally(() => {
        if (locating.current?.p === p) locating.current = null
      })
    locating.current = { p, maxAgeMs }
    return p
  }, [])

  const refresh = useCallback(async (c: NearbyCo, loc: LatLng) => {
    if (!live.current) return
    const seq = ++reqSeq.current
    // 用戶已經轉咗 tab,或者較新嘅請求已經返咗(成功定失敗都計)→ 呢個結果作廢
    const outdated = () => coRef.current !== c || seq < appliedSeq.current
    try {
      const r = await nearbyBuses(loc.lat, loc.lng, c)
      if (outdated()) return
      appliedSeq.current = seq
      base.current = { rows: r, ts: Date.now() }
      setRows(r)
      setStale(false)
      setError(null)
      writeNearbyCache(c, loc.lat, loc.lng, r)
    } catch (e) {
      if (outdated()) return
      appliedSeq.current = seq // 新位置失敗咗,舊位置嘅請求遲返都唔好蓋返上嚟
      // 攞唔到(多數斷網):保留上次好嘅列表照倒數 + 標明「上次結果」;冇先出錯誤畫面
      const b = base.current
      const kept = b ? ageRows(b.rows, Date.now() - b.ts) : []
      setRows(kept)
      setStale(kept.length > 0)
      setError(nearbyErrorText(e))
    }
  }, [])

  // 開 tab / 換營辦商:cache 即顯 → 攞新鮮位置 → 刷新
  useEffect(() => {
    writeNearbyTab(tab)
    if (tab === 'fit') return
    showCoNow(co)
    let alive = true
    void track(async () => {
      // 啱啱先定過位(例如只係轉營辦商)就沿用,唔使再等 GPS
      let loc = coords.current && Date.now() - locatedAt.current < LOC_FRESH_MS ? coords.current : null
      if (!loc) {
        try {
          loc = await locate(NEARBY_MAX_AGE)
        } catch (e) {
          // 定位唔到:有上次位置就照用(畫面會標明),冇就出錯誤 + 重試
          loc = coords.current ?? lastKnownLoc()
          if (!loc) {
            if (alive) setError(describeGeoError(e))
            return
          }
          coords.current = loc
          setOldLoc(true)
        }
      }
      if (alive) await refresh(co, loc)
    })
    return () => {
      alive = false
    }
  }, [tab, co, showCoNow, locate, refresh, track])

  // 定時刷新;位置舊咗就先靜靜再定位(背景分頁暫停,返嚟即補)
  usePolling(
    () => {
      const c = coords.current
      if (!c) return
      const due = Date.now() - locTriedAt.current > LOC_FRESH_MS
      // 回傳 promise → usePolling 可以等佢完先開下一轉
      if (!due || denied.current || locating.current) return refresh(co, c)
      // 通常一兩秒有新位置就直接用;GPS 慢就先用舊位置照刷(唔好凍住倒數),新位置到咗再刷
      let fixDone = false
      let usedOld = false
      const fresh = locate(NEARBY_MAX_AGE).then(
        (loc) => {
          fixDone = true
          return refresh(co, loc)
        },
        () => {
          fixDone = true
          setOldLoc(true)
          return usedOld ? undefined : refresh(co, coords.current ?? c)
        },
      )
      const meanwhile = wait(LOC_WAIT_MS).then(() => {
        if (fixDone) return fresh
        usedOld = true
        return refresh(co, coords.current ?? c) // 等緊期間撳咗重新定位就用嗰個位置
      })
      return Promise.race([fresh, meanwhile])
    },
    REFRESH_MS[co],
    { enabled: tab !== 'fit', key: co, immediate: false }, // 首次由上面嘅 effect 負責
  )

  // 手動重新定位:一定要新鮮位置
  const relocate = () => {
    if (busy) return
    void track(async () => {
      setError(null)
      try {
        const loc = await locate(RELOCATE_MAX_AGE)
        await refresh(co, loc)
      } catch (e) {
        setError(describeGeoError(e))
        if (coords.current) setOldLoc(true)
      }
    })
  }

  // 重試:定位有問題就重新定位;淨係網絡問題就用返而家個位置再攞
  const retry = () => {
    const c = coords.current
    if (!c || oldLoc) return relocate()
    if (busy) return
    void track(async () => {
      setError(null)
      await refresh(co, c)
    })
  }

  const notice = nearbyNotice({ hasRows: rows.length > 0, stale, error, oldLoc })

  return (
    <div>
      <div className="nearby-bar">
        <div className="nearby-cos" role="group" aria-label="揀交通工具">
          {NEARBY_COS.map((c) => {
            const active = tab === c
            return (
              <button
                key={c}
                type="button"
                className={`co-chip ${active ? 'on' : ''}`}
                style={coVar(CO_COLOR[c])}
                aria-pressed={active}
                onClick={() => setTab(c)}
              >
                {coLabel(c)}
              </button>
            )
          })}
          <button
            type="button"
            className={`co-chip ${tab === 'fit' ? 'on' : ''}`}
            style={coVar(FIT_COLOR)}
            aria-pressed={tab === 'fit'}
            onClick={() => setTab('fit')}
          >
            <span aria-hidden="true">🏋️</span> 24/7
          </button>
        </div>
        {tab !== 'fit' && (
          <button className="nearby-relocate" aria-busy={busy} aria-disabled={busy} onClick={relocate}>
            <span className="nearby-relocate-ic" aria-hidden="true">
              ↻
            </span>
            重新定位
          </button>
        )}
      </div>

      {tab === 'fit' && (
        <Suspense fallback={<MascotState mood="busy" text="載入分店地圖…" />}>
          <FitnessView onPlanTo={onPlanTo} />
        </Suspense>
      )}
      {tab !== 'fit' && (
        <>
          {notice && (
            <div className={`nearby-notice ${error ? 'warn' : ''}`}>
              <span role="status">{notice.text}</span>
              {notice.retry && (
                <button className="preset-chip" aria-disabled={busy} onClick={retry}>
                  重試
                </button>
              )}
            </div>
          )}
          {busy && rows.length === 0 && !error && <MascotState mood="busy" text="📡 搵緊你附近嘅車…" />}
          {error && rows.length === 0 && (
            <div>
              <MascotState mood="sad" text={error} />
              <div style={{ textAlign: 'center' }}>
                <button className="primary-btn" aria-disabled={busy} onClick={retry}>
                  重試
                </button>
              </div>
            </div>
          )}
          {!busy && !error && rows.length === 0 && !stale && (
            <MascotState mood="sad" text={`附近暫時冇${coLabel(co)}即將到站嘅班次`} />
          )}

          <ul className={`nearby-list ${stale ? 'is-stale' : ''}`}>
            {rows.map((r, i) => (
              <li key={`${r.co}-${r.route}-${r.dir}-${r.stopId}-${i}`}>
                <button className="nearby-row" onClick={() => onOpen(r)}>
                  <span className={`route-badge sm ${coClass(r.co)}`}>{r.route}</span>
                  <span className="nearby-info">
                    <span className="nearby-dest">{r.dest ? `往 ${r.dest}` : coLabel(r.co)}</span>
                    <span className="muted small">
                      {r.stopName} · {formatDistance(r.dist)}
                    </span>
                  </span>
                  <span className="nearby-eta">
                    <span className="muted small">下一班</span>
                    <span className="nearby-times">
                      <span className={`nearby-min ${(r.mins[0] ?? 99) <= 3 ? 'soon' : ''}`}>
                        {timeLabel(r.mins[0] ?? 0)}
                      </span>
                      {r.mins.length > 1 && (
                        <span className="nearby-next">
                          {r.mins
                            .slice(1)
                            .map((m) => timeLabel(m))
                            .join(', ')}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {rows.length > 0 && (
            <p className="small muted" style={{ textAlign: 'center' }}>
              每 {REFRESH_MS[co] / 1000} 秒自動刷新 · 位置只喺你部機運算,唔會上傳
            </p>
          )}
        </>
      )}
    </div>
  )
}
