import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Eta } from '../api/bus'
import { _resetBackNavForTests } from '../hooks/useBackLayer'
import DisplayMode from './DisplayMode'

// 網絡全部 mock 走:天氣 / 新聞永遠 pending,ETA 由每個 test 自己控制
const getEta = vi.fn<() => Promise<Eta[]>>()
vi.mock('../api/bus', () => ({
  getEta: () => getEta(),
  coClass: (co: string) => `co-${co}`,
}))
vi.mock('../api/weather', () => ({ getWeather: () => new Promise(() => {}) }))
vi.mock('../lib/http', () => ({ fetchJson: () => new Promise(() => {}) }))

const T0 = Date.parse('2026-09-25T08:00:05+08:00')
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
const FAV = {
  co: 'kmb',
  route: '1A',
  bound: 'O',
  serviceType: '1',
  stopId: 'S1',
  stopName: '尖沙咀碼頭',
  dest: '中秀茂坪',
}

const flush = () => act(async () => {})
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
const root = () => document.querySelector('.dmode') as HTMLElement

describe('DisplayMode', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 })
    vi.spyOn(history, 'go').mockImplementation(() => {})
    _resetBackNavForTests()
    localStorage.clear()
    getEta.mockReset()
  })
  afterEach(async () => {
    cleanup()
    await flush()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('long-press lock', () => {
    it('exits after a single 3 s hold', async () => {
      const onExit = vi.fn()
      render(<DisplayMode onExit={onExit} />)
      fireEvent.pointerDown(root(), { pointerId: 1, isPrimary: true })
      await advance(3000)
      expect(onExit).toHaveBeenCalledOnce()
    })

    it('a two-finger tap does not leak a timer that exits later', async () => {
      const onExit = vi.fn()
      render(<DisplayMode onExit={onExit} />)
      fireEvent.pointerDown(root(), { pointerId: 1, isPrimary: true })
      fireEvent.pointerDown(root(), { pointerId: 2, isPrimary: false })
      fireEvent.pointerUp(root(), { pointerId: 2, isPrimary: false })
      fireEvent.pointerUp(root(), { pointerId: 1, isPrimary: true })
      await advance(5000)
      expect(onExit).not.toHaveBeenCalled()
    })

    it('a short tap only shows the lock hint', async () => {
      const onExit = vi.fn()
      render(<DisplayMode onExit={onExit} />)
      fireEvent.pointerDown(root(), { pointerId: 1, isPrimary: true })
      fireEvent.pointerUp(root(), { pointerId: 1, isPrimary: true })
      expect(screen.getByText(/已鎖定/)).toBeTruthy()
      await advance(5000)
      expect(onExit).not.toHaveBeenCalled()
      expect(screen.queryByText(/已鎖定/)).toBeNull()
    })

    it('ignores a mouse just passing over (pointerleave without a press)', () => {
      render(<DisplayMode onExit={() => {}} />)
      fireEvent.pointerLeave(root(), { pointerId: 1, isPrimary: true })
      expect(screen.queryByText(/已鎖定/)).toBeNull()
    })

    it('is no longer one giant role=button', () => {
      render(<DisplayMode onExit={() => {}} />)
      expect(root().getAttribute('role')).toBeNull()
      expect(screen.getByText(/長按畫面 3 秒退出/)).toBeTruthy()
    })
  })

  describe('ETA rows', () => {
    it('counts down, dims after failed refreshes, and keeps 最後更新 at the last success', async () => {
      localStorage.setItem('kmb.favorites', JSON.stringify([FAV]))
      getEta.mockResolvedValueOnce([eta(T0 + 5 * 60_000)])
      render(<DisplayMode onExit={() => {}} />)
      await flush()
      const row = () => document.querySelector('.dm-row') as HTMLElement
      expect(row().querySelector('.dm-m1')?.textContent).toBe('5分')
      expect(row().classList.contains('stale')).toBe(false)
      const upd = () => document.querySelector('.dm-upd')?.textContent ?? ''
      const firstUpd = upd()
      expect(firstUpd).toContain(`最後更新 ${new Date(T0).toLocaleTimeString('zh-HK', { hour12: false })}`)

      // 之後斷網:兩輪失敗
      getEta.mockRejectedValue(new TypeError('Failed to fetch'))
      await advance(10_000)
      expect(row().classList.contains('stale')).toBe(false)
      await advance(10_000)
      expect(row().classList.contains('stale')).toBe(true)
      expect(row().textContent).toContain('未能更新')
      expect(upd()).toBe(firstUpd) // 失敗唔會郁「最後更新」

      // 分鐘照住絕對時間倒數,唔會凍喺 5 分
      await advance(2 * 60_000)
      expect(row().querySelector('.dm-m1')?.textContent).toBe('3分')

      // 班車開走晒 → 唔講「冇班次」,講連線中斷
      await advance(4 * 60_000)
      expect(row().textContent).toContain('連線中斷')
      expect(row().classList.contains('offline')).toBe(true)
      expect(row().textContent).not.toContain('冇班次')
    })

    it('shows 連線中斷 (not a forever …) when the first loads keep failing', async () => {
      localStorage.setItem('kmb.favorites', JSON.stringify([FAV]))
      getEta.mockRejectedValue(new TypeError('Failed to fetch'))
      render(<DisplayMode onExit={() => {}} />)
      await flush()
      expect(document.querySelector('.dm-m1')?.textContent).toBe('…')
      await advance(10_000)
      expect(document.querySelector('.dm-m1')?.textContent).toBe('連線中斷')
      expect(document.querySelector('.dm-upd')?.textContent).not.toContain('最後更新')
    })
  })
})
