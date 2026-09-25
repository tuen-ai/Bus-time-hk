import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StationSchedule, TrainArrival } from '../api/mtr'
import { getMtrFavs, type MtrFav } from '../lib/mtrFavs'
import MtrFavorites from './MtrFavorites'

// 首頁港鐵收藏:同站兩個方向一個請求、⚠️ 標記、弱網保留上次資料、撳卡 / 移除
const fetchSchedule = vi.fn<(line: string, sta: string) => Promise<StationSchedule>>()
vi.mock('../api/mtr', () => ({ fetchSchedule: (line: string, sta: string) => fetchSchedule(line, sta) }))

const T0 = Date.parse('2026-09-25T08:00:00+08:00')
const train = (ttnt: number, dest: string, plat = '1'): TrainArrival => ({
  dest,
  plat,
  ttnt,
  time: '',
  seq: 1,
})
const sched = (p: Partial<StationSchedule>): StationSchedule => ({
  up: [],
  down: [],
  sysTime: null,
  isDelay: false,
  special: false,
  message: null,
  url: null,
  ...p,
})
const TST = sched({ up: [train(3, 'TSW', '1'), train(7, 'TSW', '1')], down: [train(0, 'CEN', '2')] })

const setFavs = (list: MtrFav[]) => localStorage.setItem('kkcx.mtrFavs', JSON.stringify(list))
const flush = () => act(() => vi.advanceTimersByTimeAsync(0))
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const card = (text: string) => screen.getByText(text).closest('.fav-card') as HTMLElement

describe('MtrFavorites', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    localStorage.clear()
    fetchSchedule.mockReset()
  })
  afterEach(async () => {
    cleanup()
    await flush()
    vi.useRealTimers()
    localStorage.clear()
  })

  it('冇港鐵收藏:乜都唔出,唔會發請求', async () => {
    const { container } = render(<MtrFavorites onOpen={() => {}} />)
    await flush()
    expect(container.innerHTML).toBe('')
    expect(fetchSchedule).not.toHaveBeenCalled()
  })

  it('同一個站兩個方向:一個請求;每張卡顯示實時目的地、下 2 班同月台', async () => {
    setFavs([
      { line: 'TWL', sta: 'TST', dir: 'UP' },
      { line: 'TWL', sta: 'TST', dir: 'DOWN' },
      { line: 'ISL', sta: 'CEN', dir: 'UP' },
    ])
    fetchSchedule.mockImplementation(async (line) =>
      line === 'TWL' ? TST : sched({ up: [train(4, 'CHW', '1')], isDelay: true }),
    )
    render(<MtrFavorites onOpen={() => {}} />)
    await flush()
    expect(fetchSchedule).toHaveBeenCalledTimes(2)
    expect(fetchSchedule).toHaveBeenCalledWith('TWL', 'TST')
    expect(fetchSchedule).toHaveBeenCalledWith('ISL', 'CEN')

    const up = card('荃灣綫 · 往荃灣')
    expect(within(up).getByText('3 分鐘')).toBeTruthy()
    expect(within(up).getByText('7 分鐘')).toBeTruthy()
    expect(within(up).getAllByText('月台 1')).toHaveLength(2)
    expect(within(up).queryByText(/延誤/)).toBeNull()
    const down = card('荃灣綫 · 往中環')
    expect(within(down).getByText('即將抵達')).toBeTruthy()
    expect(within(down).getByText('月台 2')).toBeTruthy()
    // 延誤標記直接睇嗰個站自己個回應
    expect(within(card('港島綫 · 往柴灣')).getByText('班次資料顯示有延誤')).toBeTruthy()

    // 15 秒後再攞一轉(仍然係每站一個請求)
    await advance(15_000)
    expect(fetchSchedule).toHaveBeenCalledTimes(4)
  })

  it('特別車務安排 / 此方向冇車:唔扮有班次', async () => {
    setFavs([
      { line: 'EAL', sta: 'SHT', dir: 'UP' },
      { line: 'TWL', sta: 'CEN', dir: 'DOWN' },
      { line: 'KTL', sta: 'MOK', dir: 'UP' },
    ])
    fetchSchedule.mockImplementation(async (line) =>
      line === 'EAL'
        ? sched({ special: true, message: '東鐵綫特別車務安排', url: 'https://example.com/notice' })
        : line === 'KTL'
          ? sched({ special: true })
          : sched({ up: [train(2, 'TSW')] }),
    )
    render(<MtrFavorites onOpen={() => {}} />)
    await flush()
    const eal = card('沙田')
    expect(within(eal).getByText('特別車務安排')).toBeTruthy()
    expect(within(eal).getByText('暫無實時班次 · 撳站名睇車務通告')).toBeTruthy()
    // 冇通告連結:唔好叫人去睇一份唔存在嘅通告
    expect(within(card('旺角')).getByText('暫無實時班次 · 撳站名睇詳情')).toBeTruthy()
    expect(within(card('中環')).getByText('此方向暫無班次')).toBeTruthy()
  })

  it('一次失敗:保留上次班次(分鐘數照扣)+ 細提示;超過 5 分鐘先變錯誤', async () => {
    setFavs([{ line: 'TWL', sta: 'TST', dir: 'UP' }])
    fetchSchedule.mockResolvedValueOnce(TST)
    render(<MtrFavorites onOpen={() => {}} />)
    await flush()
    expect(screen.getByText('3 分鐘')).toBeTruthy()

    fetchSchedule.mockRejectedValue(new DOMException('signal timed out', 'TimeoutError'))
    await advance(2 * 60_000)
    expect(screen.getByText('1 分鐘')).toBeTruthy() // 3 分鐘 - 過咗 2 分鐘
    expect(screen.getByText('5 分鐘')).toBeTruthy()
    expect(screen.getByText(/網絡唔穩 · 顯示緊 08:00 嘅資料/)).toBeTruthy()
    expect(document.querySelector('.eta-error')).toBeNull()

    await advance(4 * 60_000)
    expect(screen.queryByText(/分鐘/)).toBeNull()
    const err = document.querySelector('.eta-error')
    expect(err?.textContent).toContain('網絡太慢')
    expect(err?.textContent).not.toMatch(/timed out/)

    // 撳重試 → 好返
    fetchSchedule.mockResolvedValue(TST)
    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    await flush()
    expect(screen.getByText('3 分鐘')).toBeTruthy()
    expect(screen.queryByText(/網絡唔穩/)).toBeNull()
  })

  it('舊資料啲車扣晒:講「暫時攞唔到最新班次」,唔好扮「此方向暫無班次」', async () => {
    setFavs([{ line: 'TWL', sta: 'TST', dir: 'UP' }])
    fetchSchedule.mockResolvedValueOnce(sched({ up: [train(1, 'TSW'), train(2, 'TSW')] }))
    render(<MtrFavorites onOpen={() => {}} />)
    await flush()
    expect(screen.getByText('1 分鐘')).toBeTruthy()

    fetchSchedule.mockRejectedValue(new DOMException('signal timed out', 'TimeoutError'))
    await advance(3 * 60_000)
    expect(screen.queryByText(/分鐘/)).toBeNull()
    expect(screen.getByText('暫時攞唔到最新班次')).toBeTruthy()
    expect(screen.queryByText('此方向暫無班次')).toBeNull()
    expect(screen.getByText(/網絡唔穩 · 顯示緊 08:00 嘅資料 · 重試中/)).toBeTruthy()
  })

  it('撳卡開鐵路頁(帶綫 + 站);★ 移除收藏', async () => {
    setFavs([
      { line: 'TWL', sta: 'TST', dir: 'UP' },
      { line: 'ISL', sta: 'CEN', dir: 'DOWN' },
    ])
    fetchSchedule.mockImplementation(async (line) =>
      line === 'TWL' ? TST : sched({ down: [train(5, 'KET', '2')] }),
    )
    const onOpen = vi.fn()
    render(<MtrFavorites onOpen={onOpen} />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /^尖沙咀/ }))
    expect(onOpen).toHaveBeenCalledWith('TWL', 'TST')

    fireEvent.click(screen.getByRole('button', { name: '移除港鐵收藏 港島綫 中環 往堅尼地城' }))
    expect(screen.queryByText('中環')).toBeNull()
    expect(getMtrFavs()).toEqual([{ line: 'TWL', sta: 'TST', dir: 'UP' }])
  })
})
