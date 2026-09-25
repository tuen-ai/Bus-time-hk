import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Weather } from '../api/weather'
import { _resetBackNavForTests } from '../hooks/useBackLayer'
import DisplayMode from './DisplayMode'

// 鍵盤退出(撳住 Esc 3 秒)+ 天氣警告 pill 揀最嚴重嗰個
vi.mock('../api/bus', () => ({ getEta: () => new Promise(() => {}), coClass: (co: string) => `co-${co}` }))
const getWeather = vi.fn<() => Promise<Weather>>()
vi.mock('../api/weather', () => ({ getWeather: () => getWeather() }))
vi.mock('../lib/http', () => ({ fetchJson: () => new Promise(() => {}) }))

const T0 = Date.parse('2026-09-25T08:00:05+08:00')
const flush = () => act(async () => {})
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
const wx = (warnings: Weather['warnings']): Weather => ({
  tempC: 28,
  humidity: 80,
  warnings,
  rainfall: {},
  updatedAt: T0,
})

describe('DisplayMode 無障礙', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 })
    vi.spyOn(history, 'go').mockImplementation(() => {})
    _resetBackNavForTests()
    localStorage.clear()
    getWeather.mockReset()
    getWeather.mockImplementation(() => new Promise(() => {}))
  })
  afterEach(async () => {
    cleanup()
    await flush()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('⌨️ 撳住 Esc 3 秒退出', () => {
    it('撳住 3 秒就退出(自動連發嘅 keydown 唔會重新計)', async () => {
      const onExit = vi.fn()
      render(<DisplayMode onExit={onExit} />)
      fireEvent.keyDown(window, { key: 'Escape' })
      await advance(1500)
      fireEvent.keyDown(window, { key: 'Escape', repeat: true })
      await advance(1499)
      expect(onExit).not.toHaveBeenCalled()
      await advance(1)
      expect(onExit).toHaveBeenCalledOnce()
    })

    it('撳一下只彈鎖定提示,唔會退出', async () => {
      const onExit = vi.fn()
      render(<DisplayMode onExit={onExit} />)
      fireEvent.keyDown(window, { key: 'Escape' })
      fireEvent.keyUp(window, { key: 'Escape' })
      expect(screen.getByText(/已鎖定/).textContent).toContain('撳住 Esc 3 秒')
      await advance(5000)
      expect(onExit).not.toHaveBeenCalled()
    })

    it('撳住期間轉咗視窗(keyup 漏咗):唔會 3 秒後自己退出', async () => {
      const onExit = vi.fn()
      render(<DisplayMode onExit={onExit} />)
      fireEvent.keyDown(window, { key: 'Escape' })
      fireEvent.blur(window)
      await advance(5000)
      expect(onExit).not.toHaveBeenCalled()
    })

    it('其他掣唔理;退出咗 timer 清走', async () => {
      const onExit = vi.fn()
      const { unmount } = render(<DisplayMode onExit={onExit} />)
      fireEvent.keyDown(window, { key: 'Enter' })
      await advance(5000)
      expect(onExit).not.toHaveBeenCalled()
      fireEvent.keyDown(window, { key: 'Escape' })
      unmount()
      await advance(5000)
      expect(onExit).not.toHaveBeenCalled()
    })

    it('讀屏同底部提示都有講鍵盤點退出', () => {
      render(<DisplayMode onExit={() => {}} />)
      const sr = screen.getByText(/長按畫面 3 秒退出/).textContent
      expect(sr).toContain('撳住 Esc 3 秒')
      expect(document.querySelector('.dm-upd')?.textContent).toContain('撳住 Esc 3 秒退出')
    })
  })

  describe('⚠️ 天氣警告 pill', () => {
    it('冇警告:唔出 pill', async () => {
      getWeather.mockResolvedValue(wx([]))
      render(<DisplayMode onExit={() => {}} />)
      await flush()
      expect(document.querySelector('.dm-warn')).toBeNull()
    })

    it('揀最嚴重嗰個(唔跟 HKO 次序),顏色跟首頁天氣列,其餘講 +N', async () => {
      getWeather.mockResolvedValue(
        wx([
          { code: 'WL', name: '山泥傾瀉警告' },
          { code: 'WHOT', name: '酷熱天氣警告' },
          { code: 'TC8NE', name: '八號東北烈風或暴風信號' },
          { code: 'WRAINR', name: '紅色暴雨警告信號' },
        ]),
      )
      render(<DisplayMode onExit={() => {}} />)
      await flush()
      const pill = document.querySelector('.dm-warn') as HTMLElement
      expect(pill.className).toContain('w-red')
      expect(pill.textContent).toContain('八號東北烈風或暴風信號')
      expect(pill.textContent).toContain('+3')
      expect(pill.textContent).toContain('仲有 3 個警告')
    })

    it('黑雨:黑色 pill;得一個警告就冇 +N', async () => {
      getWeather.mockResolvedValue(wx([{ code: 'WRAINB', name: '黑色暴雨警告信號' }]))
      render(<DisplayMode onExit={() => {}} />)
      await flush()
      const pill = document.querySelector('.dm-warn') as HTMLElement
      expect(pill.className).toContain('w-black')
      expect(pill.textContent).not.toContain('+')
    })

    it('黃色警告:維持琥珀色(冇 w-red / w-black)', async () => {
      getWeather.mockResolvedValue(wx([{ code: 'WHOT', name: '酷熱天氣警告' }]))
      render(<DisplayMode onExit={() => {}} />)
      await flush()
      expect((document.querySelector('.dm-warn') as HTMLElement).className).toContain('w-amber')
    })
  })
})
