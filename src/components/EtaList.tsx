// 純展示:一個站嘅未來班次清單 + 最後更新 / 刷新 / 讀出。
// 邊個負責 fetch 由 caller 決定(EtaPanel 自己輪詢;Favorites 一個 loop 攞晒所有收藏)。
import type { Eta, Route } from '../api/bus'
import { clockLabel, etaLabel } from '../lib/time'
import { speak, speechSupported } from '../lib/speech'

function etaIsSoon(eta: string | null): boolean {
  if (!eta) return false
  return new Date(eta).getTime() - Date.now() <= 3 * 60_000
}

/** 讀出下一班(眼唔使盯住 mon,兼顧無障礙) */
function speakEtas(route: Route, etas: Eta[]): void {
  const mins = etas
    .filter((e) => e.eta)
    .map((e) => Math.round((new Date(e.eta!).getTime() - Date.now()) / 60000))
  if (!mins.length) {
    speak(`${route.route} 往 ${route.dest_tc},暫時冇預計班次`)
    return
  }
  const first = mins[0] <= 0 ? '即將到站' : `下一班仲有 ${mins[0]} 分鐘`
  const next = mins.length > 1 && mins[1] > 0 ? `,之後嗰班 ${mins[1]} 分鐘` : ''
  speak(`${route.route} 往 ${route.dest_tc},${first}${next}`)
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

interface Props {
  route: Route
  etas: Eta[]
  updatedAt: number | null
  /** 幾多秒刷新一次(只係顯示文字) */
  refreshSec: number
  onRefresh: () => void
}

export default function EtaList({ route, etas, updatedAt, refreshSec, onRefresh }: Props) {
  const hasAny = etas.some((e) => e.eta)
  return (
    <div className="eta-panel">
      {!hasAny && <div className="muted">暫無預計班次</div>}
      {hasAny && (
        <ul className="eta-list">
          {etas.map((e, i) => (
            <li key={`${e.eta ?? 'na'}-${e.eta_seq}-${i}`} className="eta-row">
              <span className={`eta-mins ${etaIsSoon(e.eta) ? 'soon' : ''}`}>{etaLabel(e.eta)}</span>
              <span className="eta-clock">{clockLabel(e.eta)}</span>
              {e.rmk_tc && <span className="eta-rmk">{e.rmk_tc}</span>}
            </li>
          ))}
        </ul>
      )}
      {updatedAt && (
        <div className="eta-updated muted">
          最後更新 {clockLabel(new Date(updatedAt).toISOString())} · 每 {refreshSec} 秒自動刷新
          <button className="refresh-btn" onClick={onRefresh} aria-label="立即刷新">
            ↻ 刷新
          </button>
          {speechSupported && (
            <button className="refresh-btn" onClick={() => speakEtas(route, etas)} aria-label="讀出到站時間">
              🔊 讀出
            </button>
          )}
        </div>
      )}
    </div>
  )
}
