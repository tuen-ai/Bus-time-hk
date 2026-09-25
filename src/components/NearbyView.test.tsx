import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import NearbyView from './NearbyView'
import { getPosition } from '../lib/geo'
import { nearbyBuses, NearbyError, readNearbyCache, writeNearbyCache, type NearbyRow } from '../lib/nearby'

// 定位同網絡 mock 走;其餘(cache、提示文字、倒數)用真嘢
vi.mock('../lib/geo', async (orig) => ({
  ...(await orig<typeof import('../lib/geo')>()),
  getPosition: vi.fn(),
}))
vi.mock('../lib/nearby', async (orig) => ({
  ...(await orig<typeof import('../lib/nearby')>()),
  nearbyBuses: vi.fn(),
}))
// 淨係要名同顏色;唔好拉成個路線資料層入嚟
vi.mock('../api/bus', () => ({
  CO_COLOR: { kmb: '#c8102e', ctb: '#0e7490', gmb: '#167a3a' },
  coLabel: (co: string) => ({ kmb: '九巴', ctb: '城巴', gmb: '綠van' })[co] ?? co,
  coClass: (co: string) => (co === 'kmb' ? '' : `co-${co}`),
}))
vi.mock('../api/kmb', () => ({ fetchStopEta: vi.fn() }))
vi.mock('../api/ctb', () => ({ fetchCtbEta: vi.fn() }))
vi.mock('../api/gmb', () => ({ fetchGmbStopAll: vi.fn() }))
vi.mock('../lib/store', () => ({ getStopMap: vi.fn() }))
vi.mock('../lib/planGraph', () => ({ loadGraph: vi.fn(), nearStops: vi.fn() }))

const row = (route: string, mins: number[]): NearbyRow => ({
  co: 'kmb',
  route,
  dir: 'O',
  serviceType: '1',
  dest: '尖沙咀',
  stopId: 'S',
  stopName: '彌敦道',
  dist: 80,
  mins,
})
const pos = (lat: number, lng: number) =>
  ({ coords: { latitude: lat, longitude: lng } }) as GeolocationPosition

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const renderView = () => render(<NearbyView onOpen={() => {}} onPlanTo={() => {}} />)

describe('NearbyView', () => {
  it('有 cache 都要重新定位,唔好用 cache 入面嘅舊座標查', async () => {
    writeNearbyCache('kmb', 22.3, 114.1, [row('1', [5])])
    vi.mocked(getPosition).mockResolvedValue(pos(22.28, 114.16))
    vi.mocked(nearbyBuses).mockResolvedValue([row('2', [3])])
    renderView()
    await waitFor(() => expect(nearbyBuses).toHaveBeenCalledWith(22.28, 114.16, 'kmb'))
    expect(getPosition).toHaveBeenCalledWith({ maxAgeMs: 60_000 })
    expect(nearbyBuses).not.toHaveBeenCalledWith(22.3, 114.1, 'kmb')
  })

  it('斷網:保留上次結果 + cache,講明原因同出重試,唔會話附近冇車', async () => {
    writeNearbyCache('kmb', 22.3, 114.1, [row('1', [5])])
    vi.mocked(getPosition).mockResolvedValue(pos(22.3, 114.1))
    vi.mocked(nearbyBuses).mockRejectedValue(new NearbyError('攞唔到到站時間 · 冇網絡連線'))
    renderView()
    expect(await screen.findByText('⚠️ 攞唔到到站時間 · 冇網絡連線(顯示緊上次結果)')).toBeTruthy()
    expect(screen.getByText('往 尖沙咀')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy()
    expect(screen.queryByText(/附近暫時冇/)).toBeNull()
    expect(readNearbyCache('kmb')?.rows).toHaveLength(1)
  })

  it('定位失敗但有上次位置:照用,但標明係上次位置', async () => {
    writeNearbyCache('kmb', 22.3, 114.1, [row('1', [5])])
    vi.mocked(getPosition).mockRejectedValue(Object.assign(new Error('denied'), { code: 1 }))
    vi.mocked(nearbyBuses).mockResolvedValue([row('1', [4])])
    renderView()
    expect(await screen.findByText('📍 定位唔到,顯示緊上次位置附近嘅車')).toBeTruthy()
    expect(nearbyBuses).toHaveBeenCalledWith(22.3, 114.1, 'kmb')
  })

  it('冇 cache 又定唔到位:錯誤 + 重試(唔係英文)', async () => {
    vi.mocked(getPosition).mockRejectedValue(Object.assign(new Error('User denied Geolocation'), { code: 1 }))
    renderView()
    expect(await screen.findByText(/定位權限被拒絕/)).toBeTruthy()
    expect(screen.queryByText(/User denied/)).toBeNull()
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy()
  })

  it('用緊上次位置,附近冇車都要講明係上次位置', async () => {
    writeNearbyCache('ctb', 22.3, 114.1, [row('1', [5])])
    vi.mocked(getPosition).mockRejectedValue(Object.assign(new Error('unavailable'), { code: 2 }))
    vi.mocked(nearbyBuses).mockResolvedValue([])
    renderView()
    expect(await screen.findByText(/附近暫時冇九巴/)).toBeTruthy()
    expect(screen.getByText('📍 定位唔到,顯示緊上次位置附近嘅車')).toBeTruthy()
    expect(nearbyBuses).toHaveBeenCalledWith(22.3, 114.1, 'kmb')
  })

  it('背景再定位 GPS 慢:唔好凍住到站時間,先用舊位置刷,新位置到咗再刷', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(getPosition).mockResolvedValueOnce(pos(22.3, 114.1))
      vi.mocked(nearbyBuses).mockResolvedValue([row('1', [5])])
      renderView()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(nearbyBuses).toHaveBeenLastCalledWith(22.3, 114.1, 'kmb')

      let resolveFix: (p: GeolocationPosition) => void = () => {}
      vi.mocked(getPosition).mockImplementationOnce(() => new Promise((r) => (resolveFix = r)))
      // 過咗 2 分鐘 → 輪詢開始背景再定位(GPS 一直未有 fix)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2 * 60_000 + 5_000)
      })
      expect(getPosition).toHaveBeenCalledTimes(2)
      vi.mocked(nearbyBuses).mockClear()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      expect(nearbyBuses).toHaveBeenCalledWith(22.3, 114.1, 'kmb')

      await act(async () => {
        resolveFix(pos(22.4, 114.2))
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(nearbyBuses).toHaveBeenLastCalledWith(22.4, 114.2, 'kmb')
    } finally {
      vi.useRealTimers()
    }
  })

  it('背景定位等緊時撳重新定位:舊定位遲返唔好蓋咗新位置', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(getPosition).mockResolvedValueOnce(pos(22.3, 114.1))
      vi.mocked(nearbyBuses).mockResolvedValue([row('1', [5])])
      renderView()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      let resolveBg: (p: GeolocationPosition) => void = () => {}
      vi.mocked(getPosition).mockImplementationOnce(() => new Promise((r) => (resolveBg = r)))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2 * 60_000 + 5_000)
      })
      vi.mocked(getPosition).mockResolvedValueOnce(pos(22.5, 114.3))
      vi.mocked(nearbyBuses).mockClear()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '重新定位' }))
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(nearbyBuses).toHaveBeenLastCalledWith(22.5, 114.3, 'kmb')
      // 背景定位仲未返,等咗幾秒照刷:要用啱啱重新定位嘅位置,唔係舊位置
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      expect(nearbyBuses).not.toHaveBeenCalledWith(22.3, 114.1, 'kmb')
      await act(async () => {
        resolveBg(pos(22.31, 114.11))
        await vi.advanceTimersByTimeAsync(5_000)
      })
      expect(nearbyBuses).not.toHaveBeenCalledWith(22.31, 114.11, 'kmb')
      expect(nearbyBuses).toHaveBeenLastCalledWith(22.5, 114.3, 'kmb')
    } finally {
      vi.useRealTimers()
    }
  })

  it('重新定位要攞新鮮位置,chips 有 aria-pressed', async () => {
    vi.mocked(getPosition).mockResolvedValue(pos(22.3, 114.1))
    vi.mocked(nearbyBuses).mockResolvedValue([row('1', [5])])
    renderView()
    await screen.findByText('往 尖沙咀')
    expect(screen.getByRole('button', { name: /九巴/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /城巴/ }).getAttribute('aria-pressed')).toBe('false')
    vi.mocked(getPosition).mockClear()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '重新定位' }))
    })
    expect(getPosition).toHaveBeenCalledWith({ maxAgeMs: 5_000 })
  })
})
