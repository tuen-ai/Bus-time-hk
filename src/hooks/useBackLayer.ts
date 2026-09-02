import { useEffect, useRef } from 'react'

// 「返回」鍵導航。
//
// 以前成個 app 只有一個 history entry,所以無論你入咗幾深(路線詳情 / 設定 / 揀地點),
// 一撳 Android 返回鍵(或瀏覽器上一頁、邊緣滑動)就即刻閂咗成個 app。
//
// 而家每開多一層畫面就 push 一個 history entry:撳返回先關返最上面嗰層,
// 一層一層退,全部關晒返到首頁先至真係離開。
//
// 實作重點:
// - 所有 history 操作延到 microtask 先做(schedule)。開一層同時閂一層(例如設定 →
//   顯示模式)喺同一個 React commit 入面完成,深度冇變就唔會郁 history,避免
//   pushState / go() 撞車。
// - 深度存喺 history.state.kkcxNav,唔靠自己數,所以就算用戶前進/後退幾格都對得返。
// - locked 層(門口顯示模式)撳返回唔會退出,只會補返一個 entry + 彈鎖定提示。

interface Layer {
  close: () => void
  locked: boolean
  onBlocked: () => void
}

interface Options {
  /** true = 撳返回唔會關佢(例如已鎖定嘅門口顯示模式),只係食咗個返回動作 */
  locked?: boolean
  /** locked 層被撳返回時嘅提示 */
  onBlocked?: () => void
}

const stack: Layer[] = []
let historyDepth = 0
let scheduled = false

/** 保留 history.state 原有欄位(例如 hash 相關),只加 / 改深度 */
const stateFor = (depth: number) => ({
  ...(history.state as Record<string, unknown> | null),
  kkcxNav: depth,
})

/** 將實際 history 深度對齊 stack 深度(一個 microtask 只做一次) */
function sync(): void {
  scheduled = false
  const want = stack.length
  if (want > historyDepth) {
    for (let d = historyDepth + 1; d <= want; d++) history.pushState(stateFor(d), '')
    historyDepth = want
  } else if (want < historyDepth) {
    const diff = historyDepth - want
    historyDepth = want
    history.go(-diff) // 會觸發 popstate,但 stack 已經淺過 depth,唔會再關嘢
  }
}

function schedule(): void {
  if (scheduled) return
  scheduled = true
  queueMicrotask(sync)
}

function onPopState(e: PopStateEvent): void {
  const depth = (e.state as { kkcxNav?: number } | null)?.kkcxNav ?? 0
  historyDepth = depth
  // 淺過或等於而家嘅 stack → 係我哋自己 go() 造成,或者用戶撳「前進」,唔使處理
  if (stack.length <= depth) return

  const top = stack[stack.length - 1]
  if (top.locked) {
    // 鎖定層:唔畀返回鍵退出,補返一個 entry 頂住個 app
    top.onBlocked()
    historyDepth = stack.length
    history.pushState(stateFor(historyDepth), '')
    return
  }

  // 由最上面嗰層開始關落去(通常淨係一層)。
  // 唔喺度改 stack —— 交由各層 effect cleanup splice,再由 cleanup 嘅 schedule 對齊。
  const closing = stack.slice(depth)
  for (let i = closing.length - 1; i >= 0; i--) closing[i].close()
}

if (typeof window !== 'undefined') window.addEventListener('popstate', onPopState)

/**
 * 註冊一層「返回鍵可以關」嘅畫面。
 * @param active 呢層而家開住(false = 唔佔 history)
 * @param close  撳返回時點樣關佢
 */
export function useBackLayer(active: boolean, close: () => void, opts: Options = {}): void {
  const closeRef = useRef(close)
  closeRef.current = close
  const blockedRef = useRef(opts.onBlocked)
  blockedRef.current = opts.onBlocked
  const locked = !!opts.locked

  useEffect(() => {
    if (!active) return
    const layer: Layer = {
      close: () => closeRef.current(),
      locked,
      onBlocked: () => blockedRef.current?.(),
    }
    stack.push(layer)
    schedule()
    return () => {
      const i = stack.indexOf(layer)
      if (i >= 0) stack.splice(i, 1)
      schedule()
    }
  }, [active, locked])
}
