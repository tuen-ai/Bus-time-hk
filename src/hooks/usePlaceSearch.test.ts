import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geocode, type GeoPlace } from '../api/geocode'
import { localPlaces } from '../lib/localPlaces'
import { mergePlaces, usePlaceSearch } from './usePlaceSearch'

vi.mock('../api/geocode', () => ({ geocode: vi.fn() }))
vi.mock('../lib/localPlaces', () => ({ localPlaces: vi.fn(() => []) }))

const place = (label: string): GeoPlace => ({ label, lat: 22.3, lng: 114.1 })

// 手動控制每個 query 嘅 geocode 幾時返
function deferGeocode() {
  const pending = new Map<string, (v: GeoPlace[]) => void>()
  vi.mocked(geocode).mockImplementation((q: string) => new Promise<GeoPlace[]>((res) => pending.set(q, res)))
  return async (q: string, v: GeoPlace[]) => {
    await act(async () => {
      pending.get(q)?.(v)
    })
  }
}

describe('mergePlaces', () => {
  it('本地排先、同名唔重複、最多 8 個', () => {
    const local = [place('葵芳站')]
    const geo = [place('葵芳站'), ...Array.from({ length: 10 }, (_, i) => place(`地址${i}`))]
    const out = mergePlaces(local, geo)
    expect(out).toHaveLength(8)
    expect(out[0].label).toBe('葵芳站')
    expect(out.filter((p) => p.label === '葵芳站')).toHaveLength(1)
  })
})

describe('usePlaceSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(localPlaces).mockReturnValue([])
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('本地建議即刻出,geocode 返嚟再補', async () => {
    vi.mocked(localPlaces).mockReturnValue([place('葵芳站')])
    const resolve = deferGeocode()
    const { result } = renderHook(() => usePlaceSearch('葵芳', false))
    expect(result.current.results.map((p) => p.label)).toEqual(['葵芳站'])
    expect(result.current.searching).toBe(true)
    await act(async () => {
      vi.advanceTimersByTime(350)
    })
    await resolve('葵芳', [place('葵芳廣場')])
    expect(result.current.results.map((p) => p.label)).toEqual(['葵芳站', '葵芳廣場'])
    expect(result.current.searching).toBe(false)
  })

  it('舊 query 嘅 geocode 遲返,唔可以覆蓋新 query 嘅結果', async () => {
    const resolve = deferGeocode()
    const { result, rerender } = renderHook(({ q }) => usePlaceSearch(q, false), {
      initialProps: { q: '葵' },
    })
    await act(async () => {
      vi.advanceTimersByTime(350) // 「葵」嘅 geocode 出咗街
    })
    rerender({ q: '葵涌廣場' })
    await act(async () => {
      vi.advanceTimersByTime(350)
    })
    await resolve('葵涌廣場', [place('葵涌廣場')])
    await resolve('葵', [place('葵興'), place('葵盛')]) // 慢嗰個遲返
    expect(result.current.results.map((p) => p.label)).toEqual(['葵涌廣場'])
  })

  it('揀咗(paused)之後,遲返嘅結果唔會再彈返個 list 出嚟', async () => {
    const resolve = deferGeocode()
    const { result, rerender } = renderHook(({ paused }) => usePlaceSearch('葵涌廣場', paused), {
      initialProps: { paused: false },
    })
    await act(async () => {
      vi.advanceTimersByTime(350)
    })
    expect(result.current.searching).toBe(true)
    rerender({ paused: true })
    expect(result.current.results).toEqual([])
    expect(result.current.searching).toBe(false)
    await resolve('葵涌廣場', [place('葵涌廣場')])
    expect(result.current.results).toEqual([])
  })

  it('清咗搜尋字:冇結果、唔再 loading', () => {
    vi.mocked(localPlaces).mockReturnValue([place('葵芳站')])
    deferGeocode()
    const { result, rerender } = renderHook(({ q }) => usePlaceSearch(q, false), {
      initialProps: { q: '葵芳' },
    })
    rerender({ q: '' })
    expect(result.current.results).toEqual([])
    expect(result.current.searching).toBe(false)
  })
})
