// 頂層錯誤邊界:任何 component render 時 throw,唔會白畫面,而係畀個「重新載入」掣。
// PWA 用戶白咗畫面係好難自救(要清 cache),所以呢層一定要有。
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { PandaSad } from './Mascots'
import { DB_NAME } from '../lib/kv'
import { friendlyError } from '../lib/http'
import { isChunkError, isReloading, reloadOnce } from '../lib/appUpdate'

interface State {
  error: Error | null
  /** chunk 載入失敗、已經自動 reload 緊 */
  reloading: boolean
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, reloading: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 純本地 log,方便用戶截圖報錯;唔上傳
    console.error('[可可出行] render 出錯', error, info.componentStack)
    // 部署咗新版、舊 lazy chunk 攞唔到 → 有網就自動 reload 一次(10 分鐘內唔會再嚟,唔會 loop);
    // 離線 reload 都冇用,留喺呢度等用戶有網再撳
    if (isChunkError(error) && navigator.onLine && reloadOnce()) this.setState({ reloading: true })
  }

  private reload = () => window.location.reload()

  /** 清走本機快取(路線 / 站點),保留收藏同設定,再重新載入 */
  private resetCache = () => {
    try {
      for (const k of ['bus.routes', 'kmb.stops']) localStorage.removeItem(k) // 舊版殘留
      indexedDB.deleteDatabase(DB_NAME)
    } catch {
      /* ignore */
    }
    this.reload()
  }

  render() {
    const { error, reloading } = this.state
    if (!error) return this.props.children
    const chunk = isChunkError(error)
    const updating = chunk && (reloading || isReloading())
    // 唔直接顯示英文錯誤;原文收埋喺「技術資料」,截圖報錯先打開
    const hint = updating
      ? '可可出行有新版本,即刻幫你重新載入~'
      : chunk
        ? navigator.onLine
          ? '有新版本或者網絡唔穩定,撳重新載入就得。'
          : `${friendlyError(error)},有網再撳重新載入就得。`
        : '頁面遇到錯誤,重新載入通常就冇事。'
    return (
      <div className="crash" role="alert">
        <PandaSad />
        <div className="crash-title">{updating ? '更新緊新版本…' : '哎呀,出咗啲事…'}</div>
        <div className="muted small">{hint}</div>
        <details className="crash-detail">
          <summary>技術資料(報錯用)</summary>
          {error.message}
        </details>
        <button className="primary-btn full" onClick={this.reload}>
          <span aria-hidden="true">🔄</span> 重新載入
        </button>
        <button className="preset-chip full-w" style={{ minHeight: 44 }} onClick={this.resetCache}>
          <span aria-hidden="true">🧹</span> 清走快取再載入(收藏唔會唔見)
        </button>
      </div>
    )
  }
}
