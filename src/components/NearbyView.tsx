import { useCallback, useEffect, useRef, useState } from 'react'
import {
  nearbyBuses,
  readNearbyCache,
  writeNearbyCache,
  type NearbyCo,
  type NearbyRow,
} from '../lib/nearby'
import { getPosition, describeGeoError, formatDistance } from '../lib/geo'
import { coClass, CO_COLOR, coLabel } from '../api/bus'
import { MascotState } from './Mascots'

const CO_TABS: NearbyCo[] = ['kmb', 'ctb', 'gmb']
// KMB 一炮一站好平;CTB 逐路線好貴 → 刷新頻率分開
const REFRESH_MS: Record<NearbyCo, number> = { kmb: 5_000, ctb: 12_000, gmb: 12_000 }
const timeLabel = (m: number) => (m <= 0 ? '即將' : `${m}分`)

export default function NearbyView({ onOpen }: { onOpen: (r: NearbyRow) => void }) {
  const [co, setCo] = useState<NearbyCo>(() => {
    const s = localStorage.getItem('kkcx.nearby.co')
    return s === 'ctb' || s === 'gmb' ? s : 'kmb'
  })
  const [rows, setRows] = useState<NearbyRow[]>([])
  const [stale, setStale] = useState(false) // 顯示緊上次結果
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const coords = useRef<{ lat: number; lng: number } | null>(null)
  const coRef = useRef(co)
  coRef.current = co

  // 換營辦商:即刻俾 cache,再靜靜攞新
  const showCoNow = useCallback((c: NearbyCo) => {
    const cached = readNearbyCache(c)
    if (cached) {
      setRows(cached.rows)
      setStale(true)
      if (!coords.current) coords.current = { lat: cached.lat, lng: cached.lng }
    } else {
      setRows([])
      setStale(false)
    }
  }, [])

  const refresh = useCallback(
    async (c: NearbyCo, loc: { lat: number; lng: number }) => {
      try {
        const r = await nearbyBuses(loc.lat, loc.lng, c)
        if (coRef.current !== c) return // 用戶已經轉咗 tab
        setRows(r)
        setStale(false)
        setError(null)
        writeNearbyCache(c, loc.lat, loc.lng, r)
      } catch (e) {
        if (coRef.current !== c) return
        if (!readNearbyCache(c)) setError(e instanceof Error ? e.message : '載入失敗')
      }
    },
    [],
  )

  // 開 tab / 換營辦商:cache 即顯 + 自動定位刷新
  useEffect(() => {
    localStorage.setItem('kkcx.nearby.co', co)
    showCoNow(co)
    let alive = true
    ;(async () => {
      setBusy(true)
      try {
        if (!coords.current) {
          const pos = await getPosition()
          coords.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        }
        if (!alive) return
        await refresh(co, coords.current)
      } catch (e) {
        if (alive && !readNearbyCache(co)) setError(describeGeoError(e))
      } finally {
        if (alive) setBusy(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [co, refresh, showCoNow])

  // 定時刷新(用已知位置)
  useEffect(() => {
    const id = setInterval(() => {
      const c = coords.current
      if (c) void refresh(co, c)
    }, REFRESH_MS[co])
    return () => clearInterval(id)
  }, [co, refresh])

  const relocate = async () => {
    setBusy(true)
    setError(null)
    try {
      const pos = await getPosition()
      coords.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      await refresh(co, coords.current)
    } catch (e) {
      setError(describeGeoError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="co-filter">
        {CO_TABS.map((c) => {
          const active = co === c
          const color = CO_COLOR[c]
          return (
            <button
              key={c}
              className={`co-chip ${active ? 'on' : ''}`}
              style={active ? { background: color, borderColor: color } : { color, borderColor: color }}
              onClick={() => setCo(c)}
            >
              {coLabel(c)}
            </button>
          )
        })}
        <button className="back-btn" style={{ marginLeft: 'auto' }} onClick={() => void relocate()}>
          ↻ 重新定位
        </button>
      </div>

      {stale && <div className="muted small" style={{ margin: '0 2px 8px' }}>⏳ 顯示緊上次結果,更新緊…</div>}
      {busy && rows.length === 0 && !error && <MascotState mood="busy" text="📡 搵緊你附近嘅車…" />}
      {error && rows.length === 0 && (
        <div>
          <MascotState mood="sad" text={error} />
          <div style={{ textAlign: 'center' }}>
            <button className="primary-btn" onClick={() => void relocate()}>重試</button>
          </div>
        </div>
      )}
      {!busy && !error && rows.length === 0 && !stale && (
        <MascotState mood="sad" text={`附近暫時冇${coLabel(co)}即將到站嘅班次`} />
      )}

      <ul className="nearby-list">
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
                      {r.mins.slice(1).map((m) => timeLabel(m)).join(', ')}
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
    </div>
  )
}
