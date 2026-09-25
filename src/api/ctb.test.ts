import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { _resetKvForTests, cacheGet, cachePut } from '../lib/kv'
import { _resetCtbStopsForTests, fetchCtbStop, flushCtbStops } from './ctb'

const DAY = 24 * 60 * 60 * 1000
const stopBody = (id: string) =>
  new Response(JSON.stringify({ data: { stop: id, name_tc: `站${id}`, lat: '22.3', long: '114.1' } }))

describe('fetchCtbStop(IndexedDB 快取)', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    _resetKvForTests()
    _resetCtbStopsForTests()
    vi.useFakeTimers({ toFake: ['Date'] }) // fake-indexeddb 內部用 setTimeout,只 fake Date
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => vi.useRealTimers())

  it('重開 app(記憶體清咗)都唔使再 fetch', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (u) => stopBody(String(u).split('/').pop()!))
    expect((await fetchCtbStop('001'))?.name_tc).toBe('站001')
    expect(await fetchCtbStop('001')).toMatchObject({ stop: '001' })
    expect(spy).toHaveBeenCalledTimes(1)
    await flushCtbStops()

    _resetCtbStopsForTests()
    _resetKvForTests() // 模擬重開:只剩 IndexedDB
    expect((await fetchCtbStop('001'))?.name_tc).toBe('站001')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('同時幾個 caller 要同一個站只 fetch 一次', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => stopBody('002'))
    await Promise.all([fetchCtbStop('002'), fetchCtbStop('002'), fetchCtbStop('002')])
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('失敗唔記低:下次再試到', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(stopBody('003'))
    expect(await fetchCtbStop('003')).toBeNull()
    expect((await fetchCtbStop('003'))?.name_tc).toBe('站003')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('30 日由第一次寫入計:後加嘅站唔會續命,過期會重新 fetch', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (u) => stopBody(String(u).split('/').pop()!))
    await fetchCtbStop('004')
    await flushCtbStops()
    vi.setSystemTime(1_000_000 + 10 * DAY)
    await fetchCtbStop('005')
    await flushCtbStops()
    expect((await cacheGet('ctb.stops', 60 * DAY))?.age).toBe(10 * DAY)

    vi.setSystemTime(1_000_000 + 31 * DAY)
    _resetCtbStopsForTests()
    await fetchCtbStop('004')
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('快取壞咗(唔係 object)當冇,照 fetch', async () => {
    await cachePut('ctb.stops', null)
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => stopBody('006'))
    expect((await fetchCtbStop('006'))?.name_tc).toBe('站006')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('空 data(站唔存在)唔當有效站,亦唔寫入快取', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: {} })))
    expect(await fetchCtbStop('007')).toBeNull()
    await flushCtbStops()
    expect(await cacheGet('ctb.stops', 60 * DAY)).toBeNull()
  })
})
