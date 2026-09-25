// 全屏 / modal 面板嘅 Tab 鍵陷阱:aria-modal 淨係管讀屏,管唔到鍵盤,
// 要自己將 Tab / Shift+Tab 喺面板入面兜圈,唔好跌返去後面個版。

const FOCUSABLE =
  'button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled):not([type="hidden"]), [href], [tabindex]:not([tabindex="-1"])'

/** 面板入面撳得到嘅元素(跳過 hidden,例如收埋嘅 <input type=file hidden>) */
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[hidden]'))
}

type TabKey = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>

/** 喺面板 onKeyDown 度 call:Tab 去到尾 → 返頭;Shift+Tab 喺頭 → 去尾 */
export function trapTab(e: TabKey, root: HTMLElement | null): void {
  if (e.key !== 'Tab' || !root) return
  const f = focusables(root)
  if (!f.length) return
  const first = f[0]
  const last = f[f.length - 1]
  const active = document.activeElement
  if (e.shiftKey && (active === first || !root.contains(active))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (active === last || !root.contains(active))) {
    e.preventDefault()
    first.focus()
  }
}
