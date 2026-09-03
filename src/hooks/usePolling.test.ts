import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePolling } from './usePolling'

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setHidden(false)
  })
  afterEach(() => {
    cleanup()
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
})
