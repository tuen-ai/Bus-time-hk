import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Eta, Route } from '../api/bus'
import { getEta } from '../api/bus'
import EtaPanel from './EtaPanel'

// 淨係測 EtaPanel 嘅輪詢 / 舊資料 / 錯誤顯示;getEta 由 test 控制
vi.mock('../api/bus', () => ({ getEta: vi.fn() }))
vi.mock('../lib/speech', () => ({ speak: vi.fn(), speechSupported: false }))

const T0 = Date.parse('2026-09-25T08:00:00+08:00')
const route: Route = {
  co: 'kmb',
  route: '1A',
  bound: 'O',
  service_type: '1',
  orig_tc: '',
  dest_tc: '中秀茂坪',
}

const eta = (mins: number, rmk = '', seq = 1): Eta => ({
  co: 'kmb',
  route: '1A',
  dir: 'O',
  service_type: 1,
  seq: 1,
  dest_tc: '中秀茂坪',
  eta_seq: seq,
  eta: new Date(T0 + mins * 60_000).toISOString(),
  rmk_tc: rmk,
  data_timestamp: '',
})

const mockEta = vi.mocked(getEta)
const flush = () => act(() => vi.advanceTimersByTimeAsync(0))
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  act(() => void document.dispatchEvent(new Event('visibilitychange')))
}

describe('EtaPanel', () => {
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

  it('攞唔到 → 保留上次班次 + 網絡唔穩提示,唔會變錯誤、唔顯示英文', async () => {
    mockEta.mockResolvedValueOnce([eta(4, '', 1), eta(12, '', 2)])
    mockEta.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<EtaPanel route={route} stopId="s1" />)
    await flush()
    expect(screen.getByText('4 分鐘')).toBeTruthy()
    expect(screen.queryByText(/網絡唔穩/)).toBeNull()

    await tick(5000)
    expect(screen.getByText(/網絡唔穩 · 顯示緊 08:00 嘅資料/)).toBeTruthy()
    expect(screen.getByText('4 分鐘')).toBeTruthy()
    await tick(60_000)
    expect(screen.getByText('3 分鐘')).toBeTruthy() // 失敗 tick 照重畫:用返絕對時間重計
    expect(screen.queryByText(/Failed to fetch/)).toBeNull()
    expect(screen.queryByText('重試')).toBeNull()
  })

  it('舊資料超過 5 分鐘 → 先顯示錯誤(廣東話)+ 重試', async () => {
    mockEta.mockResolvedValueOnce([eta(30)])
    mockEta.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<EtaPanel route={route} stopId="s1" />)
    await flush()
    await tick(5 * 60_000)
    expect(screen.getByText(/網絡唔穩/)).toBeTruthy()
    await tick(5000)
    expect(screen.queryByText(/網絡唔穩/)).toBeNull()
    expect(screen.getByText('連唔到伺服器,請稍後再試')).toBeTruthy()
    expect(screen.getByText('重試')).toBeTruthy()
  })

  it('一路攞唔到、舊資料過咗 5 分鐘 → 直接變錯誤,唔會喺慢請求期間閃 skeleton', async () => {
    mockEta.mockResolvedValueOnce([eta(30)])
    mockEta.mockRejectedValue(new TypeError('Failed to fetch'))
    const { container } = render(<EtaPanel route={route} stopId="s1" />)
    await flush()
    await tick(5 * 60_000)
    expect(screen.getByText(/網絡唔穩/)).toBeTruthy()
    mockEta.mockImplementation(() => new Promise(() => {})) // 下一轉卡住(等 timeout)
    await tick(5000)
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
    expect(screen.queryByText(/網絡唔穩/)).toBeNull()
    expect(screen.getByText('連唔到伺服器,請稍後再試')).toBeTruthy()
    expect(screen.getByText('重試')).toBeTruthy()
  })

  it('從未成功 → 錯誤 + 重試;撳重試攞到就顯示班次', async () => {
    mockEta.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<EtaPanel route={route} stopId="s1" />)
    await flush()
    expect(screen.getByText('連唔到伺服器,請稍後再試')).toBeTruthy()
    mockEta.mockResolvedValueOnce([eta(6)])
    fireEvent.click(screen.getByText('重試'))
    await flush()
    expect(screen.getByText('6 分鐘')).toBeTruthy()
  })

  it('換站:舊站遲返嘅結果唔會蓋過新站', async () => {
    let resolveOld: (v: Eta[]) => void = () => {}
    mockEta.mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
    mockEta.mockResolvedValueOnce([eta(9)])
    const { rerender } = render(<EtaPanel route={route} stopId="old" />)
    rerender(<EtaPanel route={route} stopId="new" />)
    await flush()
    expect(screen.getByText('9 分鐘')).toBeTruthy()
    resolveOld([eta(2)])
    await flush()
    expect(screen.getByText('9 分鐘')).toBeTruthy()
    expect(screen.queryByText('2 分鐘')).toBeNull()
  })

  it('rmk_tc → 可信度標籤;認唔到嘅備註照原文', async () => {
    mockEta.mockResolvedValue([eta(3, '原定班次', 1), eta(20, '最後班次', 2), eta(25, '月台 1', 3)])
    render(<EtaPanel route={route} stopId="s1" />)
    await flush()
    expect(screen.getByText('預定')).toBeTruthy()
    expect(screen.getByText('尾班車')).toBeTruthy()
    expect(screen.getByText('月台 1')).toBeTruthy()
    expect(screen.queryByText('原定班次')).toBeNull()
  })

  it('舊資料啲車走晒 → 唔講「暫無預計班次」', async () => {
    mockEta.mockResolvedValueOnce([eta(1)])
    mockEta.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<EtaPanel route={route} stopId="s1" />)
    await flush()
    await tick(3 * 60_000)
    expect(screen.getByText(/網絡唔穩/)).toBeTruthy()
    expect(screen.getByText('暫時攞唔到最新班次')).toBeTruthy()
    expect(screen.queryByText('暫無預計班次')).toBeNull()
  })

  it('背景分頁返嚟、新資料未到:超過 5 分鐘嘅舊班次唔會扮新鮮(變返 skeleton)', async () => {
    mockEta.mockResolvedValueOnce([eta(4)])
    mockEta.mockImplementation(() => new Promise(() => {})) // 返嚟之後網絡好慢
    const { container } = render(<EtaPanel route={route} stopId="s1" />)
    await flush()
    expect(screen.getByText('08:04')).toBeTruthy()
    setHidden(true)
    await tick(10 * 60_000)
    setHidden(false)
    await flush()
    expect(screen.queryByText('08:04')).toBeNull()
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })

  it('背景分頁返嚟(5 分鐘內)、新資料未到:走咗嘅車執走,分鐘數按而家重計', async () => {
    mockEta.mockResolvedValueOnce([eta(1, '', 1), eta(9, '', 2)])
    mockEta.mockImplementation(() => new Promise(() => {}))
    render(<EtaPanel route={route} stopId="s1" />)
    await flush()
    expect(screen.getByText('9 分鐘')).toBeTruthy()
    setHidden(true)
    await tick(3 * 60_000)
    setHidden(false)
    await flush()
    expect(screen.queryByText('08:01')).toBeNull()
    expect(screen.getByText('6 分鐘')).toBeTruthy()
  })
})
