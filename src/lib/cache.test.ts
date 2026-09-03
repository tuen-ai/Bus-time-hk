import { describe, expect, it, vi } from 'vitest'
import { memoAsync } from './cache'

describe('memoAsync', () => {
  it('in-flight 期間多個 caller 只發一次請求', async () => {
    let resolve!: (v: number) => void
    const fn = vi.fn(() => new Promise<number>((r) => (resolve = r)))
    const get = memoAsync(fn, 10_000)
    const a = get()
    const b = get()
    expect(fn).toHaveBeenCalledTimes(1)
    resolve(42)
    expect(await a).toBe(42)
    expect(await b).toBe(42)
  })

  it('TTL 內回快取,過咗 TTL 先再 fetch', async () => {
    vi.useFakeTimers()
    let n = 0
    const get = memoAsync(async () => ++n, 1000)
    expect(await get()).toBe(1)
    expect(await get()).toBe(1)
    vi.advanceTimersByTime(1001)
    expect(await get()).toBe(2)
    vi.useRealTimers()
  })

  it('刷新失敗但有舊值 → 回舊值;完全冇值 → 拋錯', async () => {
    vi.useFakeTimers()
    let fail = false
    const get = memoAsync(async () => {
      if (fail) throw new Error('boom')
      return 'ok'
    }, 1000)
    expect(await get()).toBe('ok')
    vi.advanceTimersByTime(1001)
    fail = true
    expect(await get()).toBe('ok') // graceful
    vi.useRealTimers()

    const bad = memoAsync(async () => {
      throw new Error('first')
    }, 1000)
    await expect(bad()).rejects.toThrow('first')
  })
})
