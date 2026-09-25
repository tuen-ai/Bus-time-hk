// 純展示:一個站嘅未來班次清單 + 最後更新 / 刷新 / 讀出。
// 邊個負責 fetch 由 caller 決定(EtaPanel 自己輪詢;Favorites 一個 loop 攞晒所有收藏)。
import type { Eta, Route } from '../api/bus'
import { etaTrust } from '../lib/etaTrust'
import { clockLabel, etaLabel } from '../lib/time'
import { speak, speechSupported } from '../lib/speech'

function etaIsSoon(eta: string | null): boolean {
  if (!eta) return false
  return new Date(eta).getTime() - Date.now() <= 3 * 60_000
}

const hhmm = (ms: number) => clockLabel(new Date(ms).toISOString())

/** 讀出下一班(眼唔使盯住 mon,兼顧無障礙) */
function speakEtas(route: Route, etas: Eta[], staleFrom: number | null): void {
  const prefix = staleFrom != null ? `網絡唔穩,以下係 ${hhmm(staleFrom)} 嘅資料。` : ''
  const mins = etas
    .filter((e) => e.eta)
    .map((e) => Math.round((new Date(e.eta!).getTime() - Date.now()) / 60000))
  if (!mins.length) {
    speak(`${prefix}${route.route} 往 ${route.dest_tc},暫時冇預計班次`)
    return
  }
  const first = mins[0] <= 0 ? '即將到站' : `下一班仲有 ${mins[0]} 分鐘`
  const next = mins.length > 1 && mins[1] > 0 ? `,之後嗰班 ${mins[1]} 分鐘` : ''
  speak(`${prefix}${route.route} 往 ${route.dest_tc},${first}${next}`)
}

export function EtaSkeleton() {
  return (
    <div className="eta-panel" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skel-row">
          <span className="skel w-eta" />
          <span className="skel w-clock" />
        </div>
      ))}
    </div>
  )
}

/** 從未攞到資料(或者舊資料已經超過 5 分鐘):錯誤 + 重試 */
export function EtaError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="eta-panel error eta-error">
      <span>
        <span aria-hidden="true">⚠️ </span>
        {message}
      </span>
      <button type="button" className="preset-chip" onClick={onRetry}>
        重試
      </button>
    </div>
  )
}

/** 班次可信度細標籤(預定 / 尾班車);認唔到嘅備註照原文 */
function EtaNotes({ rmk }: { rmk: string }) {
  const { tags, rest } = etaTrust(rmk)
  if (!tags.length && !rest) return null
  return (
    <span className="eta-notes">
      {tags.includes('sched') && (
        <span className="tag tag-sched" title="按時間表估算,未有實時位置">
          <span aria-hidden="true">🕒 </span>預定<span className="sr-only">班次,非實時</span>
        </span>
      )}
      {tags.includes('last') && (
        <span className="tag tag-last">
          <span aria-hidden="true">🌙 </span>尾班車
        </span>
      )}
      {rest && <span className="eta-rmk">{rest}</span>}
    </span>
  )
}

interface Props {
  route: Route
  etas: Eta[]
  updatedAt: number | null
  /** 幾多秒刷新一次(只係顯示文字) */
  refreshSec: number
  onRefresh: () => void
  /** true = 今次攞唔到,顯示緊 updatedAt 嗰陣嘅舊資料(caller 已經去走過咗嘅班次) */
  stale?: boolean
}

export default function EtaList({ route, etas, updatedAt, refreshSec, onRefresh, stale = false }: Props) {
  const hasAny = etas.some((e) => e.eta)
  const staleFrom = stale && updatedAt != null ? updatedAt : null
  return (
    <div className={`eta-panel ${staleFrom != null ? 'stale' : ''}`}>
      {staleFrom != null && (
        <div className="eta-stale">
          <span aria-hidden="true">📶 </span>網絡唔穩 · 顯示緊 {hhmm(staleFrom)} 嘅資料 · 重試中
        </div>
      )}
      {/* 舊資料啲車走晒唔等於冇車:唔好講「暫無預計班次」 */}
      {!hasAny && <div className="muted">{staleFrom != null ? '暫時攞唔到最新班次' : '暫無預計班次'}</div>}
      {hasAny && (
        <ul className="eta-list">
          {etas.map((e, i) => (
            <li key={`${e.eta ?? 'na'}-${e.eta_seq}-${i}`} className="eta-row">
              {/* 舊資料唔好用「就到」嘅顏色催人 */}
              <span className={`eta-mins ${staleFrom == null && etaIsSoon(e.eta) ? 'soon' : ''}`}>
                {etaLabel(e.eta)}
              </span>
              <span className="eta-clock">{clockLabel(e.eta)}</span>
              <EtaNotes rmk={e.rmk_tc} />
            </li>
          ))}
        </ul>
      )}
      {updatedAt != null && (
        <div className="eta-updated muted">
          最後更新 {hhmm(updatedAt)} · 每 {refreshSec} 秒自動刷新
          <button className="refresh-btn" onClick={onRefresh} aria-label="立即刷新">
            ↻ 刷新
          </button>
          {speechSupported && (
            <button
              className="refresh-btn"
              onClick={() => speakEtas(route, etas, staleFrom)}
              aria-label="讀出到站時間"
            >
              🔊 讀出
            </button>
          )}
        </div>
      )}
    </div>
  )
}
