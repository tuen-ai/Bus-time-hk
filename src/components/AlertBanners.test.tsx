import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AlertBanners from './AlertBanners'
import { alertAll } from '../lib/chime'
import { getReminder, setReminder, type LeaveReminder } from '../lib/reminder'

// 淨係截住「響」;倒數格式用真嘢
vi.mock('../lib/chime', async (orig) => ({
  ...(await orig<typeof import('../lib/chime')>()),
  alertAll: vi.fn(),
}))

const rem = (at: number, destLabel = '公司'): LeaveReminder => ({
  at,
  destLabel,
  journeyMins: 30,
  arriveBy: '09:00',
})

describe('AlertBanners 出門提醒', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-25T08:00:00+08:00'))
  })
  afterEach(() => {
    act(() => setReminder(null))
    cleanup()
    vi.useRealTimers()
    localStorage.clear()
  })

  it('夠鐘響一次,之後唔會每秒再響', () => {
    render(<AlertBanners />)
    act(() => setReminder(rem(Date.now() + 2000)))
    expect(alertAll).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(alertAll).toHaveBeenCalledTimes(1)
    expect(getReminder()?.fired).toBe(true)
  })

  it('上一個響完未閂,再設新提醒都照響', () => {
    render(<AlertBanners />)
    act(() => setReminder(rem(Date.now() + 1000, '學校')))
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(alertAll).toHaveBeenCalledTimes(1)

    // 冇撳 ✕,直接設過個新嘅(PlannerView.remindLeave 就係咁)
    act(() => setReminder(rem(Date.now() + 3000, '屋企')))
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(alertAll).toHaveBeenCalledTimes(2)
    expect(vi.mocked(alertAll).mock.calls[1][1]).toContain('屋企')
  })

  it('響過之後 reload(重新 mount)唔會再響舊提醒', () => {
    const first = render(<AlertBanners />)
    act(() => setReminder(rem(Date.now() + 1000)))
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(alertAll).toHaveBeenCalledTimes(1)
    first.unmount()

    render(<AlertBanners />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(alertAll).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/夠鐘出門喇/)).toBeTruthy() // 條 banner 照顯示
  })
})
