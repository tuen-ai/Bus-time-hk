import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StationSchedule } from '../api/mtr'
import MtrSchedulePanel from './MtrSchedulePanel'

const fetchSchedule = vi.fn<() => Promise<StationSchedule>>()
vi.mock('../api/mtr', () => ({ fetchSchedule: () => fetchSchedule() }))

const SCHED: StationSchedule = {
  up: [{ dest: 'TSW', plat: '1', ttnt: 3, time: '', seq: 1 }],
  down: [],
  sysTime: null,
  isDelay: false,
  special: false,
  message: null,
  url: null,
}

const flush = () => act(async () => {})
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
const text = () => document.body.textContent ?? ''

describe('MtrSchedulePanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fetchSchedule.mockReset()
  })
  afterEach(async () => {
    cleanup()
    await flush()
    vi.useRealTimers()
  })

  it('一次刷新失敗:照顯示上次時間表 + 細字提示,唔會成個變錯誤', async () => {
    fetchSchedule.mockResolvedValueOnce(SCHED)
    render(<MtrSchedulePanel line="TWL" station="TST" color="#e2231a" />)
    await flush()
    expect(text()).toContain('3 分鐘')
    expect(text()).not.toContain('網絡唔穩')

    fetchSchedule.mockRejectedValueOnce(new DOMException('signal timed out', 'TimeoutError'))
    await advance(15_000)
    expect(text()).toContain('3 分鐘')
    expect(text()).toContain('網絡唔穩')
    expect(document.querySelector('.error')).toBeNull()

    // 下一轉成功 → 提示消失
    fetchSchedule.mockResolvedValueOnce(SCHED)
    await advance(15_000)
    expect(text()).not.toContain('網絡唔穩')
  })

  it('換站後第一轉失敗:出錯誤,唔會將舊站時間表當「上次資料」', async () => {
    fetchSchedule.mockResolvedValueOnce(SCHED)
    const { rerender } = render(<MtrSchedulePanel line="TWL" station="TST" color="#e2231a" />)
    await flush()
    expect(text()).toContain('3 分鐘')

    fetchSchedule.mockRejectedValueOnce(new DOMException('signal timed out', 'TimeoutError'))
    rerender(<MtrSchedulePanel line="TWL" station="MOK" color="#e2231a" />)
    await flush()
    expect(text()).not.toContain('3 分鐘')
    expect(text()).not.toContain('網絡唔穩')
    expect(document.querySelector('.error')?.textContent).toContain('網絡太慢')
  })

  it('從未攞到:出廣東話錯誤,唔直出英文原文', async () => {
    fetchSchedule.mockRejectedValue(new DOMException('signal timed out', 'TimeoutError'))
    render(<MtrSchedulePanel line="TWL" station="TST" color="#e2231a" />)
    await flush()
    const err = document.querySelector('.error')
    expect(err?.textContent).toContain('網絡太慢')
    expect(err?.textContent).not.toMatch(/timed out/)
  })
})
