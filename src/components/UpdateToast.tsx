// ✨ 新版本提示:新 SW 接手咗而呢頁仲係舊 build → 頂部 pill「有新版本 · 撳一下更新」。
// 唔撳都照用得(舊 chunk 由 SW 上一版快取頂住);撳 ✕ 收埋,今次唔再煩。
import { useState, useSyncExternalStore } from 'react'
import { isUpdateReady, onUpdateReady } from '../lib/appUpdate'
import '../styles/updateToast.css'

export default function UpdateToast({
  onReload = () => window.location.reload(),
}: {
  onReload?: () => void
}) {
  const ready = useSyncExternalStore(onUpdateReady, isUpdateReady)
  const [hidden, setHidden] = useState(false)
  // live region 一開始就要喺度,讀屏先會讀出之後出現嘅提示
  return (
    <div className="update-toast-region" role="status">
      {ready && !hidden && (
        <div className="update-toast">
          <button type="button" className="update-toast-go" onClick={onReload}>
            <span aria-hidden="true">✨</span> 有新版本 · 撳一下更新
          </button>
          <button
            type="button"
            className="update-toast-x"
            aria-label="遲啲先更新"
            onClick={() => setHidden(true)}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}
    </div>
  )
}
