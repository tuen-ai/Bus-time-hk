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

  it('請求 hang 住:過咗 maxWaitMs 當失敗(有舊值回舊值),下一次會重新發', async () => {
    vi.useFakeTimers()
    let n = 0
    let hang = false
    const fn = vi.fn(() => (hang ? new Promise<number>(() => {}) : Promise.resolve(++n)))
    const get = memoAsync(fn, 1000, { maxWaitMs: 5000 })
    expect(await get()).toBe(1)
    vi.advanceTimersByTime(1001)
    hang = true
    const p = get()
    expect(get()).toBe(p) // 等緊嗰陣照共用
    vi.advanceTimersByTime(5000)
    expect(await p).toBe(1) // 回舊值,唔會永遠 pending
    hang = false
    expect(await get()).toBe(2) // inflight 已清,重新 fetch
    expect(fn).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('冇舊值又 hang 住 → 逾時拋 TimeoutError', async () => {
    vi.useFakeTimers()
    const get = memoAsync(() => new Promise<number>(() => {}), 1000, { maxWaitMs: 2000 })
    const p = get()
    vi.advanceTimersByTime(2000)
    await expect(p).rejects.toMatchObject({ name: 'TimeoutError' })
    vi.useRealTimers()
  })

  it('fn 同步拋錯:變 rejected promise(有舊值回舊值),唔會漏低死線 timer', async () => {
    vi.useFakeTimers()
    let boom = false
    const get = memoAsync(
      () => {
        if (boom) throw new Error('sync')
        return Promise.resolve(7)
      },
      1000,
      { maxWaitMs: 5000 },
    )
    expect(await get()).toBe(7)
    vi.advanceTimersByTime(1001)
    boom = true
    expect(await get()).toBe(7)
    expect(vi.getTimerCount()).toBe(0)
    const fresh = memoAsync((): Promise<number> => {
      throw new Error('sync')
    }, 1000)
    await expect(fresh()).rejects.toThrow('sync')
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('maxWaitMs = Infinity 即係唔設死線(唔會即刻當逾時)', async () => {
    vi.useFakeTimers()
    let resolve!: (v: number) => void
    const get = memoAsync(() => new Promise<number>((r) => (resolve = r)), 1000, { maxWaitMs: Infinity })
    const p = get()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(60_000)
    resolve(5)
    expect(await p).toBe(5)
    vi.useRealTimers()
  })
})
