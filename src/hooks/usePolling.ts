import { useEffect, useRef } from 'react'

interface Options {
  /** false = 停止輪詢(例如未有位置) */
  enabled?: boolean
  /** 變咗就即刻重跑一次 + 重設計時(例如 route / stopId) */
  key?: unknown
  /** false = 唔即刻跑第一次(caller 自己已經載咗),只係定時 + 返嚟時補 */
  immediate?: boolean
  /**
   * true = 離線(navigator.onLine === false)期間跳過 tick,返 online 即刻補。
   * 預設 false:純時鐘(倒數 / 輪播)同靠失敗 tick 更新「舊資料」嘅畫面離線都要照行。
   */
  pauseOffline?: boolean
}

type Fn = () => void | Promise<void>

const isThenable = (r: unknown): r is PromiseLike<unknown> =>
  typeof (r as { then?: unknown } | null | undefined)?.then === 'function'

/**
 * 定時輪詢,但分頁喺背景(document.hidden)時暫停,返嚟時即刻補一次。
 * 慳 API 請求 + 電量;ETA 面板 / 附近 / 港鐵班次共用。
 * fn 用 ref 存住,唔使 caller 自己 useCallback。
 *
 * fn 回傳 Promise 嘅話:上一轉未完就跳過呢個 tick(慢網唔會越疊越多、舊結果唔會後到蓋新結果);
 * 卡住超過 3 個週期(最少 30 秒)就當佢死咗照開新一轉,冇 timeout 嘅 fetch 都唔會永久停咗輪詢。
 * 網絡返嚟(online 事件)即刻補一次。
 */
export function usePolling(
  fn: Fn,
  intervalMs: number,
  { enabled = true, key, immediate = true, pauseOffline = false }: Options = {},
): void {
  // 每次 render 後更新 ref(唔喺 render 期間寫 ref,合 react-hooks/refs 規則)
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })

  useEffect(() => {
    if (!enabled) return
    let id: number | null = null
    // 每次 effect 一個新嘅 busy:key 變(換站 / 收藏變咗)唔會俾舊請求擋住第一轉
    const stallMs = Math.max(intervalMs * 3, 30_000)
    let busy: { at: number } | null = null
    const tick = () => {
      if (busy && Date.now() - busy.at < stallMs) return
      if (pauseOffline && typeof navigator !== 'undefined' && navigator.onLine === false) return
      const r = fnRef.current() // 同步 call:唔好擺入 microtask
      if (!isThenable(r)) return
      const me = (busy = { at: Date.now() })
      const done = () => {
        if (busy === me) busy = null // 舊一轉(卡死後先返)唔好清走新一轉嘅 flag
      }
      r.then(done, done) // 順手 handle 埋 rejection,唔會多出 unhandled rejection
    }
    const start = () => {
      if (id == null) id = window.setInterval(tick, intervalMs)
    }
    const stop = () => {
      if (id != null) clearInterval(id)
      id = null
    }
    const onVis = () => {
      if (document.hidden) stop()
      else {
        tick()
        start()
      }
    }
    // 出隧道 / 落車站返有網:唔使等下一個週期
    const onOnline = () => {
      if (!document.hidden) tick()
    }
    if (immediate) tick()
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onOnline)
    }
    // immediate 只影響第一次,唔使做 dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, enabled, key, pauseOffline])
}
