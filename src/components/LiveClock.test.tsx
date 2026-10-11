import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LiveClock from './LiveClock'
import { formatHkClock } from '../lib/hkClock'

describe('formatHkClock', () => {
  it('用香港時間(UTC+8)、24 小時制、有秒', () => {
    const c = formatHkClock(new Date('2026-10-11T15:05:09Z'))
    expect(c.time).toBe('23:05:09')
    expect(c.date).toBe('10月11日 (日)')
    expect(c.iso).toBe('2026-10-11T23:05:09+08:00')
  })
  it('過咗香港午夜就轉日', () => {
    const c = formatHkClock(new Date('2026-10-11T16:00:00Z'))
    expect(c.time).toBe('00:00:00')
    expect(c.date).toBe('10月12日 (一)')
  })
})

describe('LiveClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-11T15:05:09.400Z'))
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('每秒更新,對齊秒數', () => {
    render(<LiveClock />)
    const timer = screen.getByRole('timer')
    expect(timer).toHaveProperty('textContent', '23:05:0910月11日 (日)')
    expect(timer.getAttribute('aria-live')).toBe('off')
    // 未到下一秒唔變
    act(() => void vi.advanceTimersByTime(500))
    expect(screen.getByText('23:05:09')).toBeTruthy()
    // 過咗秒界就跳
    act(() => void vi.advanceTimersByTime(200))
    expect(screen.getByText('23:05:10')).toBeTruthy()
    act(() => void vi.advanceTimersByTime(3000))
    expect(screen.getByText('23:05:13')).toBeTruthy()
  })

  it('分頁收埋就停 timer,返嚟即刻追返', () => {
    render(<LiveClock />)
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(vi.getTimerCount()).toBe(0)
    act(() => void vi.advanceTimersByTime(60_000))
    hidden.mockReturnValue(false)
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(screen.getByText('23:06:09')).toBeTruthy()
    expect(vi.getTimerCount()).toBe(1)
  })
})
