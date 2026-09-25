import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Eta } from '../api/bus'
import { _resetBackNavForTests } from '../hooks/useBackLayer'
import DisplayMode from './DisplayMode'

// 網絡全部 mock 走:天氣 / 新聞永遠 pending,ETA 由每個 test 自己控制
const getEta = vi.fn<(route: unknown, stopId: string) => Promise<Eta[]>>()
vi.mock('../api/bus', () => ({
  getEta: (route: unknown, stopId: string) => getEta(route, stopId),
  coClass: (co: string) => `co-${co}`,
}))
vi.mock('../api/weather', () => ({ getWeather: () => new Promise(() => {}) }))
vi.mock('../lib/http', () => ({ fetchJson: () => new Promise(() => {}) }))

// 新版狀態:test 自己話幾時「就緒」
const upd = vi.hoisted(() => ({
  ready: false,
  subs: new Set<() => void>(),
  reloadOnce: (() => true) as () => boolean,
}))
const reloadOnce = vi.fn(() => upd.reloadOnce())
vi.mock('../lib/appUpdate', () => ({
  isUpdateReady: () => upd.ready,
  onUpdateReady: (cb: () => void) => {
    upd.subs.add(cb)
    return () => {
      upd.subs.delete(cb)
    }
  },
  reloadOnce: () => reloadOnce(),
}))
const markReady = () =>
  act(() => {
    upd.ready = true
    upd.subs.forEach((cb) => cb())
  })

const T0 = Date.parse('2026-09-25T08:00:05+08:00')
const IDLE = 60_000
const eta = (atMs: number): Eta => ({
  co: 'kmb',
  route: '1A',
  dir: 'O',
  service_type: 1,
  seq: 1,
  dest_tc: '中秀茂坪',
  eta_seq: 1,
  eta: new Date(atMs).toISOString(),
  rmk_tc: '',
  data_timestamp: '',
})
const fav = (route: string, stopId: string) => ({
  co: 'kmb',
  route,
  bound: 'O',
  serviceType: '1',
  stopId,
  stopName: `站 ${stopId}`,
  dest: '中秀茂坪',
})

const flush = () => act(async () => {})
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
const root = () => document.querySelector('.dmode') as HTMLElement
const tap = () => {
  fireEvent.pointerDown(root(), { pointerId: 1, isPrimary: true })
  fireEvent.pointerUp(root(), { pointerId: 1, isPrimary: true })
}

describe('DisplayMode 自動更新', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 })
    vi.spyOn(history, 'go').mockImplementation(() => {})
    _resetBackNavForTests()
    localStorage.clear()
    getEta.mockReset()
    reloadOnce.mockClear()
    upd.ready = false
    upd.subs.clear()
    upd.reloadOnce = () => true
  })
  afterEach(async () => {
    cleanup()
    await flush()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('冇新版就唔會 reload', async () => {
    render(<DisplayMode onExit={() => {}} />)
    await advance(5 * IDLE)
    expect(reloadOnce).not.toHaveBeenCalled()
  })

  it('開顯示模式時已經有新版:閒置 60 秒 reload', async () => {
    upd.ready = true
    render(<DisplayMode onExit={() => {}} />)
    await advance(IDLE - 1)
    expect(reloadOnce).not.toHaveBeenCalled()
    await advance(1)
    expect(reloadOnce).toHaveBeenCalledOnce()
  })

  it('之後先有新版:由嗰刻開始計;每次有人掂都重新計 60 秒', async () => {
    render(<DisplayMode onExit={() => {}} />)
    await advance(IDLE * 2)
    await markReady()
    await advance(50_000)
    tap() // 有人掂 → 再等多 60 秒
    await advance(50_000)
    expect(reloadOnce).not.toHaveBeenCalled()
    await advance(10_000)
    expect(reloadOnce).toHaveBeenCalledOnce()
  })

  it('reloadOnce 話啱啱 reload 過:唔會 loop,遲 60 秒再試', async () => {
    upd.ready = true
    upd.reloadOnce = () => false
    render(<DisplayMode onExit={() => {}} />)
    await advance(IDLE)
    expect(reloadOnce).toHaveBeenCalledTimes(1)
    await advance(IDLE)
    expect(reloadOnce).toHaveBeenCalledTimes(2)
  })

  it('退出顯示模式:清 timer + 取消訂閱', async () => {
    upd.ready = true
    const { unmount } = render(<DisplayMode onExit={() => {}} />)
    expect(upd.subs.size).toBe(1)
    unmount()
    expect(upd.subs.size).toBe(0)
    await advance(IDLE * 2)
    expect(reloadOnce).not.toHaveBeenCalled()
  })
})

describe('DisplayMode ETA 逐行更新', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 })
    vi.spyOn(history, 'go').mockImplementation(() => {})
    _resetBackNavForTests()
    localStorage.clear()
    getEta.mockReset()
    upd.ready = false
    upd.subs.clear()
  })
  afterEach(async () => {
    cleanup()
    await flush()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('一條慢線唔會拖住其他行', async () => {
    localStorage.setItem('kmb.favorites', JSON.stringify([fav('1A', 'S1'), fav('2', 'S2')]))
    getEta.mockImplementation((_r, stopId) =>
      stopId === 'S1' ? Promise.resolve([eta(T0 + 5 * 60_000)]) : new Promise(() => {}),
    )
    render(<DisplayMode onExit={() => {}} />)
    await flush()
    const rows = document.querySelectorAll('.dm-row')
    expect(rows[0].querySelector('.dm-m1')?.textContent).toBe('5分')
    expect(rows[1].querySelector('.dm-m1')?.textContent).toBe('…')
    expect(document.querySelector('.dm-upd')?.textContent).toContain('最後更新')
  })
})
