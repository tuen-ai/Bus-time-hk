// store.getStopMap:九巴站表快取(stale-while-revalidate + 失敗唔記住)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { Stop } from '../api/kmb'

const fetchStops = vi.fn<() => Promise<Stop[]>>()
vi.mock('../api/kmb', () => ({ fetchStops: () => fetchStops() }))

const DAY = 24 * 60 * 60 * 1000
const stop = (id: string, name: string): Stop => ({
  stop: id,
  name_tc: name,
  name_en: `EN ${name}`,
  name_sc: `SC ${name}`,
  lat: '22.3',
  long: '114.1',
})
const flush = () => new Promise((r) => setTimeout(r, 0))

// 每個 test 用全新 module(stopMapP 係 module 狀態)+ 全新 IndexedDB
async function fresh() {
  vi.resetModules()
  globalThis.indexedDB = new IDBFactory()
  const kv = await import('./kv')
  kv._resetKvForTests()
  const store = await import('./store')
  return { ...kv, ...store }
}

beforeEach(() => {
  fetchStops.mockReset()
})

describe('getStopMap', () => {
  it('快取 1 日內:直接用,唔 fetch', async () => {
    const { cachePut, getStopMap } = await fresh()
    await cachePut('kmb.stops', [stop('A', '舊站')], Date.now() - DAY / 2)
    expect((await getStopMap()).get('A')?.name_tc).toBe('舊站')
    expect(fetchStops).not.toHaveBeenCalled()
  })

  it('快取舊過 1 日:即刻用舊嘅,背景刷新完之後換新(只存用到嘅欄位)', async () => {
    const { cachePut, cacheGet, getStopMap } = await fresh()
    await cachePut('kmb.stops', [stop('A', '舊站')], Date.now() - 3 * DAY)
    fetchStops.mockResolvedValue([stop('A', '新站'), stop('B', '站B')])
    expect((await getStopMap()).get('A')?.name_tc).toBe('舊站')
    expect(fetchStops).toHaveBeenCalledTimes(1)
    await flush()
    const now = await getStopMap()
    expect(now.get('A')?.name_tc).toBe('新站')
    expect(now.size).toBe(2)
    const saved = (await cacheGet<Stop[]>('kmb.stops', DAY))?.data
    expect(saved?.[0]).toEqual({ stop: 'A', name_tc: '新站', lat: '22.3', long: '114.1' })
  })

  it('快取舊 + 背景刷新失敗:照用舊嘅,唔拋錯', async () => {
    const { cachePut, getStopMap } = await fresh()
    await cachePut('kmb.stops', [stop('A', '舊站')], Date.now() - 10 * DAY)
    fetchStops.mockRejectedValue(new Error('offline'))
    expect((await getStopMap()).get('A')?.name_tc).toBe('舊站')
    await flush()
    expect((await getStopMap()).get('A')?.name_tc).toBe('舊站')
  })

  it('冇快取 + fetch 失敗:回空 Map,下次再試', async () => {
    const { getStopMap } = await fresh()
    fetchStops.mockRejectedValueOnce(new Error('offline'))
    expect((await getStopMap()).size).toBe(0)
    fetchStops.mockResolvedValueOnce([stop('A', '站A')])
    expect((await getStopMap()).get('A')?.name_tc).toBe('站A')
    expect(fetchStops).toHaveBeenCalledTimes(2)
  })

  it('冇快取 + 空陣列:唔記住(記憶體同 IndexedDB 都唔寫)', async () => {
    const { cacheGet, getStopMap } = await fresh()
    fetchStops.mockResolvedValueOnce([])
    expect((await getStopMap()).size).toBe(0)
    expect(await cacheGet('kmb.stops', 30 * DAY)).toBeNull()
    fetchStops.mockResolvedValueOnce([stop('A', '站A')])
    expect((await getStopMap()).size).toBe(1)
  })
})
