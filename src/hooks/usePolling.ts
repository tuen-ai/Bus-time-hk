import { useEffect, useRef } from 'react'

interface Options {
  /** false = 停止輪詢(例如未有位置) */
  enabled?: boolean
  /** 變咗就即刻重跑一次 + 重設計時(例如 route / stopId) */
  key?: unknown
  /** false = 唔即刻跑第一次(caller 自己已經載咗),只係定時 + 返嚟時補 */
  immediate?: boolean
}

/**
 * 定時輪詢,但分頁喺背景(document.hidden)時暫停,返嚟時即刻補一次。
 * 慳 API 請求 + 電量;ETA 面板 / 附近 / 港鐵班次共用。
 * fn 用 ref 存住,唔使 caller 自己 useCallback。
 */
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  { enabled = true, key, immediate = true }: Options = {},
): void {
  // 每次 render 後更新 ref(唔喺 render 期間寫 ref,合 react-hooks/refs 規則)
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })

  useEffect(() => {
    if (!enabled) return
    let id: number | null = null
    const tick = () => void fnRef.current()
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
    if (immediate) tick()
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
    // immediate 只影響第一次,唔使做 dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, enabled, key])
}
