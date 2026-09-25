// ✨ 新版本提示:新 SW 接手咗而呢頁仲係舊 build → 頂部 pill「有新版本 · 撳一下更新」。
// 唔撳都照用得(舊 chunk 由 SW 上一版快取頂住);撳 ✕ 收埋,今次唔再煩。
import { useRef, useState, useSyncExternalStore } from 'react'
import { isUpdateReady, onUpdateReady } from '../lib/appUpdate'
import '../styles/updateToast.css'

/**
 * 撳 ✕ 收埋之後焦點去邊:返原本嗰個(仲喺度、focus 得到);唔得就首頁掣。
 * 手指 / 滑鼠撳(byPointer)而原本係輸入框就唔好送返去 —— 手機會即刻彈返個鍵盤出嚟。
 */
function refocus(from: HTMLElement | null, byPointer: boolean) {
  const typing = from?.matches("input, textarea, [contenteditable]:not([contenteditable='false'])")
  if (from?.isConnected && !(byPointer && typing)) {
    from.focus()
    if (document.activeElement === from) return
  }
  document.querySelector<HTMLElement>('.topbar-home')?.focus()
}

export default function UpdateToast({
  onReload = () => window.location.reload(),
}: {
  onReload?: () => void
}) {
  const ready = useSyncExternalStore(onUpdateReady, isUpdateReady)
  const [hidden, setHidden] = useState(false)
  // 焦點由邊度嚟(Tab 入嚟之前嗰個);撳 ✕ 收埋就送返去,唔好跌落 body
  const returnTo = useRef<HTMLElement | null>(null)
  // live region 一開始就要喺度,讀屏先會讀出之後出現嘅提示
  return (
    <div className="update-toast-region" role="status">
      {ready && !hidden && (
        <div
          className="update-toast"
          onFocus={(e) => {
            // 由外面入嚟先記;由 body / 視窗外入嚟(null)就清走,唔好留住好耐之前嗰個
            const from = e.relatedTarget as HTMLElement | null
            if (!e.currentTarget.contains(from)) returnTo.current = from
          }}
        >
          <button type="button" className="update-toast-go" onClick={onReload}>
            <span aria-hidden="true">✨</span> 有新版本 · 撳一下更新
          </button>
          <button
            type="button"
            className="update-toast-x"
            aria-label="遲啲先更新"
            onClick={(e) => {
              // 焦點喺 ✕ 先搬(✕ 會消失):返去原本位置,冇就返首頁掣。
              // detail > 0 = 手指 / 滑鼠撳;鍵盤 Enter / Space 觸發嘅 click detail 係 0
              if (document.activeElement === e.currentTarget) refocus(returnTo.current, e.detail > 0)
              setHidden(true)
            }}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}
    </div>
  )
}
