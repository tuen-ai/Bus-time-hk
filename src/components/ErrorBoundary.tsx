// 頂層錯誤邊界:任何 component render 時 throw,唔會白畫面,而係畀個「重新載入」掣。
// PWA 用戶白咗畫面係好難自救(要清 cache),所以呢層一定要有。
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { PandaSad } from './Mascots'
import { DB_NAME } from '../lib/kv'

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 純本地 log,方便用戶截圖報錯;唔上傳
    console.error('[可可出行] render 出錯', error, info.componentStack)
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
    if (!this.state.error) return this.props.children
    return (
      <div className="crash" role="alert">
        <PandaSad />
        <div className="crash-title">哎呀,出咗啲事…</div>
        <div className="muted small">頁面遇到錯誤,重新載入通常就冇事。</div>
        <div className="crash-detail">{this.state.error.message}</div>
        <button className="primary-btn full" onClick={this.reload}>
          🔄 重新載入
        </button>
        <button className="preset-chip full-w" onClick={this.resetCache}>
          🧹 清走快取再載入(收藏唔會唔見)
        </button>
      </div>
    )
  }
}
