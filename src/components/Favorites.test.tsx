import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Eta, Route } from '../api/bus'
import { getEta } from '../api/bus'
import type { Favorite } from '../lib/store'
import Favorites from './Favorites'

// 兩個收藏一齊輪詢:測每張卡各自保留舊資料 / 報錯,同埋舊一轉遲返唔會蓋過新結果
vi.mock('../api/bus', () => ({ getEta: vi.fn(), coClass: () => '' }))
vi.mock('../lib/speech', () => ({ speak: vi.fn(), speechSupported: false }))
const favs: Favorite[] = [
  { co: 'kmb', route: '1A', bound: 'O', serviceType: '1', stopId: 'A', stopName: '站甲', dest: '中秀茂坪' },
  { co: 'ctb', route: '969', bound: 'I', serviceType: '1', stopId: 'B', stopName: '站乙', dest: '天水圍' },
]
vi.mock('../lib/store', () => ({
  FAVS_CHANGED: 'kkcx:favs-changed',
  favKey: (f: Favorite) => `${f.co}|${f.route}|${f.bound}|${f.serviceType}|${f.stopId}`,
  getFavorites: () => favs,
  toggleFavorite: () => favs,
}))

const T0 = Date.parse('2026-09-25T08:00:00+08:00')
const eta = (mins: number): Eta => ({
  co: 'kmb',
  route: '1A',
  dir: 'O',
  service_type: 1,
  seq: 1,
  dest_tc: '',
  eta_seq: 1,
  eta: new Date(T0 + mins * 60_000).toISOString(),
  rmk_tc: '',
  data_timestamp: '',
})

const mockEta = vi.mocked(getEta)
const flush = () => act(() => vi.advanceTimersByTimeAsync(0))
const card = (stopName: string) => screen.getByText(stopName).closest('.fav-card') as HTMLElement
function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  act(() => void document.dispatchEvent(new Event('visibilitychange')))
}

describe('Favorites', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    setHidden(false)
  })
  afterEach(() => {
    cleanup()
    setHidden(false)
    mockEta.mockReset()
    vi.useRealTimers()
  })

  it('一張卡失敗:嗰張保留舊班次 + 提示,另一張照更新;從未成功嘅先報錯', async () => {
    let calls = 0
    mockEta.mockImplementation(async (r: Route) => {
      calls++
      if (r.co === 'kmb') {
        if (calls <= 2) return [eta(4)]
        throw new TypeError('Failed to fetch')
      }
      throw new TypeError('Load failed')
    })
    render(<Favorites onOpen={() => {}} />)
    await flush()
    expect(within(card('站甲')).getByText('4 分鐘')).toBeTruthy()
    expect(within(card('站乙')).getByText('連唔到伺服器,請稍後再試')).toBeTruthy()

    await act(() => vi.advanceTimersByTimeAsync(5000))
    const a = card('站甲')
    expect(within(a).getByText('4 分鐘')).toBeTruthy()
    expect(within(a).getByText(/網絡唔穩 · 顯示緊 08:00 嘅資料/)).toBeTruthy()
    expect(screen.queryByText(/Failed to fetch|Load failed/)).toBeNull()
  })

  it('上一轉卡住唔會疊新一轉;卡死後開新一轉,舊一轉遲返唔會蓋過新結果', async () => {
    let resolveFirst: (v: Eta[]) => void = () => {}
    mockEta.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r))) // 第一轉 站甲:卡住
    mockEta.mockResolvedValueOnce([eta(20)]) // 第一轉 站乙
    mockEta.mockResolvedValue([eta(12)]) // 之後全部
    render(<Favorites onOpen={() => {}} />)
    await flush()
    await act(() => vi.advanceTimersByTimeAsync(25_000))
    expect(mockEta).toHaveBeenCalledTimes(2) // 未完:5 秒 tick 全部跳過

    await act(() => vi.advanceTimersByTimeAsync(5000)) // 30 秒:當卡死,開新一轉
    expect(mockEta).toHaveBeenCalledTimes(4)
    expect(within(card('站甲')).getByText('08:12')).toBeTruthy()

    resolveFirst([eta(2)]) // 舊一轉而家先返
    await flush()
    expect(within(card('站甲')).getByText('08:12')).toBeTruthy()
    expect(screen.queryByText('08:02')).toBeNull()
    expect(within(card('站乙')).queryByText('08:20')).toBeNull()
  })

  it('一張卡慢(城巴等緊)唔會拖住其他卡:攞到嗰張即刻出', async () => {
    mockEta.mockImplementation((r: Route) =>
      r.co === 'kmb' ? Promise.resolve([eta(4)]) : new Promise<Eta[]>(() => {}),
    )
    render(<Favorites onOpen={() => {}} />)
    await flush()
    expect(within(card('站甲')).getByText('08:04')).toBeTruthy()
    expect(card('站乙').querySelector('[aria-busy="true"]')).toBeTruthy() // 慢嗰張仲係 skeleton
  })

  it('移除收藏掣講明係邊條線邊個站', () => {
    mockEta.mockImplementation(() => new Promise(() => {}))
    render(<Favorites onOpen={() => {}} />)
    expect(screen.getByRole('button', { name: '移除收藏 1A 站甲' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '移除收藏 969 站乙' })).toBeTruthy()
  })

  it('背景分頁返嚟、新資料未到:超過 5 分鐘嘅卡變返 skeleton,唔會顯示走咗嘅車', async () => {
    mockEta.mockResolvedValueOnce([eta(4)]).mockResolvedValueOnce([eta(6)])
    mockEta.mockImplementation(() => new Promise(() => {})) // 返嚟之後網絡好慢
    render(<Favorites onOpen={() => {}} />)
    await flush()
    expect(within(card('站甲')).getByText('08:04')).toBeTruthy()
    setHidden(true)
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000))
    setHidden(false)
    await flush()
    expect(screen.queryByText('08:04')).toBeNull()
    expect(screen.queryByText('08:06')).toBeNull()
    expect(card('站甲').querySelector('[aria-busy="true"]')).toBeTruthy()
  })
})
