import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { _resetKvForTests, cacheDel, cacheGet, cachePut } from './kv'

describe('kv(IndexedDB)', () => {
  beforeEach(() => {
    // 每個 test 全新 DB
    globalThis.indexedDB = new IDBFactory()
    _resetKvForTests()
    localStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  it('put → get round-trip,age 由寫入時間計', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }) // fake-indexeddb 內部用 setTimeout,只 fake Date
    vi.setSystemTime(1_000_000)
    await cachePut('k', { a: 1 })
    vi.setSystemTime(1_005_000)
    const hit = await cacheGet<{ a: number }>('k', 60_000)
    expect(hit).toEqual({ data: { a: 1 }, age: 5000 })
  })

  it('過咗 maxAge → null;冇 key → null', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
    await cachePut('k', 'v')
    vi.setSystemTime(10_001)
    expect(await cacheGet('k', 10_000)).toBeNull()
    expect(await cacheGet('nope', 10_000)).toBeNull()
  })

  it('一次性由 localStorage 搬遷舊快取,搬完刪走', async () => {
    localStorage.setItem('bus.routes', JSON.stringify({ ts: Date.now(), data: ['r1'] }))
    const hit = await cacheGet<string[]>('bus.routes', 60_000)
    expect(hit?.data).toEqual(['r1'])
    expect(localStorage.getItem('bus.routes')).toBeNull()
    // 之後由 IndexedDB 讀返
    _resetKvForTests()
    expect((await cacheGet<string[]>('bus.routes', 60_000))?.data).toEqual(['r1'])
  })

  it('del 之後讀唔返', async () => {
    await cachePut('k', 1)
    await cacheDel('k')
    expect(await cacheGet('k', 60_000)).toBeNull()
  })

  it('冇 IndexedDB(私密模式)→ 記憶體 fallback 仍然 work', async () => {
    // @ts-expect-error 模擬唔支援
    globalThis.indexedDB = undefined
    _resetKvForTests()
    await cachePut('k', 'mem')
    expect((await cacheGet<string>('k', 60_000))?.data).toBe('mem')
  })
})
