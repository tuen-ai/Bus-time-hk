import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePolling } from './usePolling'

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
  window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}

/** 一個由 test 控制幾時完嘅 async fn */
function deferredFn() {
  const pending: Array<{ resolve: () => void; reject: (e: unknown) => void }> = []
  const fn = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject })
      }),
  )
  return { fn, pending }
}

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setHidden(false)
  })
  afterEach(() => {
    cleanup()
    setOnline(true)
    vi.useRealTimers()
  })

  it('即刻跑一次,之後每 interval 跑', () => {
    const fn = vi.fn()
    renderHook(() => usePolling(fn, 1000))
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('immediate: false 唔跑第一次', () => {
    const fn = vi.fn()
    renderHook(() => usePolling(fn, 1000, { immediate: false }))
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('分頁去咗背景就停,返嚟即刻補一次再繼續', () => {
    const fn = vi.fn()
    renderHook(() => usePolling(fn, 1000))
    setHidden(true)
    vi.advanceTimersByTime(5000)
    expect(fn).toHaveBeenCalledTimes(1) // 背景期間冇加
    setHidden(false)
    expect(fn).toHaveBeenCalledTimes(2) // 返嚟即補
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('key 變 → 即刻重跑 + 重設計時;enabled false → 停', () => {
    const fn = vi.fn()
    const { rerender } = renderHook(({ key, on }) => usePolling(fn, 1000, { key, enabled: on }), {
      initialProps: { key: 'a', on: true },
    })
    expect(fn).toHaveBeenCalledTimes(1)
    rerender({ key: 'b', on: true })
    expect(fn).toHaveBeenCalledTimes(2)
    rerender({ key: 'b', on: false })
    vi.advanceTimersByTime(5000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('永遠用最新嘅 fn(唔使 useCallback)', () => {
    const a = vi.fn()
    const b = vi.fn()
    const { rerender } = renderHook(({ f }) => usePolling(f, 1000), { initialProps: { f: a } })
    rerender({ f: b })
    vi.advanceTimersByTime(1000)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('async fn 上一轉未完 → 跳過 tick;完咗先再跑', async () => {
    const { fn, pending } = deferredFn()
    renderHook(() => usePolling(fn, 1000))
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(fn).toHaveBeenCalledTimes(1) // 未完:唔疊
    pending[0].resolve()
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('上一轉失敗(reject)都照清 flag,下一轉照跑', async () => {
    const { fn, pending } = deferredFn()
    renderHook(() => usePolling(fn, 1000))
    pending[0].reject(new Error('boom'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('卡死超過 3 個週期(最少 30 秒)→ 當死咗,照開新一轉', async () => {
    const { fn, pending } = deferredFn()
    renderHook(() => usePolling(fn, 5000))
    await vi.advanceTimersByTimeAsync(25_000)
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000) // 30 秒
    expect(fn).toHaveBeenCalledTimes(2)
    // 舊一轉而家先返:唔好清走新一轉嘅 flag
    pending[0].resolve()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fn).toHaveBeenCalledTimes(2)
    pending[1].resolve()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('key 變 → 就算舊一轉未完都即刻跑', () => {
    const { fn } = deferredFn()
    const { rerender } = renderHook(({ key }) => usePolling(fn, 1000, { key }), {
      initialProps: { key: 'a' },
    })
    expect(fn).toHaveBeenCalledTimes(1)
    rerender({ key: 'b' })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('online 事件 → 即刻補一次(背景分頁就唔補)', () => {
    const fn = vi.fn()
    renderHook(() => usePolling(fn, 60_000))
    setOnline(false)
    setOnline(true)
    expect(fn).toHaveBeenCalledTimes(2)
    setHidden(true)
    setOnline(true)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('預設離線照跑(靠失敗 tick 更新畫面)', () => {
    const fn = vi.fn()
    setOnline(false)
    renderHook(() => usePolling(fn, 1000))
    vi.advanceTimersByTime(2000)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('pauseOffline:離線跳過 tick,返 online 即刻補再繼續', () => {
    const fn = vi.fn()
    setOnline(false)
    renderHook(() => usePolling(fn, 1000, { pauseOffline: true }))
    vi.advanceTimersByTime(5000)
    expect(fn).not.toHaveBeenCalled()
    setOnline(true)
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('unmount 之後 online 唔會再 call', () => {
    const fn = vi.fn()
    const { unmount } = renderHook(() => usePolling(fn, 1000))
    unmount()
    setOnline(true)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
