import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClockPush from './ClockPush'

// 假小屏:connect / syncTime 由每個 test 控制,記低 disconnect 次數
const h = vi.hoisted(() => ({
  connect: vi.fn<() => Promise<void>>(),
  syncTime: vi.fn<() => Promise<void>>(),
  disconnect: vi.fn(),
  push: vi.fn<() => Promise<void> | undefined>(),
  made: 0,
}))
vi.mock('../lib/skdclock', async (orig) => {
  const real = await orig<typeof import('../lib/skdclock')>()
  class FakeClock {
    status = null
    connected = false
    onDisconnect?: () => void
    onStatus?: () => void
    async connect() {
      h.made++
      await h.connect()
      this.connected = true
    }
    syncTime() {
      return h.syncTime()
    }
    async disconnect() {
      this.connected = false
      h.disconnect()
    }
    pushCanvas() {
      return h.push()
    }
  }
  return { ...real, bluetoothSupported: () => true, SkdClock: FakeClock }
})
vi.mock('../api/bus', () => ({ getEta: () => Promise.resolve([]), coClass: (co: string) => `co-${co}` }))
vi.mock('../lib/etaPoster', () => ({ renderEtaPoster: () => {} }))

const flush = () => act(async () => {})
const domErr = (name: string, message: string) => Object.assign(new Error(message), { name })

describe('ClockPush', () => {
  beforeEach(() => {
    h.connect.mockReset()
    h.syncTime.mockReset()
    h.disconnect.mockReset()
    h.push.mockReset()
    h.made = 0
    // jsdom 冇 canvas:俾個夠用嘅假 2D context
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: () => {},
    } as never)
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('is a labelled modal dialog with focus on the close button', async () => {
    render(<ClockPush onExit={() => {}} />)
    await flush()
    const dlg = screen.getByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(dlg.getAttribute('aria-labelledby')).toBe('cp-title')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('關閉')
  })

  it('keeps Tab focus inside the dialog', async () => {
    render(<ClockPush onExit={() => {}} />)
    await flush()
    const close = screen.getByLabelText('關閉')
    const connect = screen.getByText('連線小屏').closest('button') as HTMLButtonElement
    connect.focus()
    fireEvent.keyDown(connect, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(connect)
  })

  it('pulls Tab back into the dialog after focus fell to the page body', async () => {
    render(<ClockPush onExit={() => {}} />)
    await flush()
    // 例如「連線小屏」撳完變 disabled / 換走,焦點跌咗去 body
    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(document.activeElement).toBe(document.body)
    fireEvent.keyDown(document.body, { key: 'Tab' })
    expect(document.activeElement?.getAttribute('aria-label')).toBe('關閉')
    ;(document.activeElement as HTMLElement | null)?.blur()
    fireEvent.keyDown(document.body, { key: 'Tab', shiftKey: true })
    expect(screen.getByText('連線小屏').closest('button')).toBe(document.activeElement)
  })

  it('a failed connect disconnects, resets the UI and shows a Cantonese reason', async () => {
    h.connect.mockRejectedValue(
      domErr('NetworkError', 'GATT Server is disconnected. Cannot retrieve services.'),
    )
    render(<ClockPush onExit={() => {}} />)
    await flush()
    fireEvent.click(screen.getByText('連線小屏'))
    await flush()
    expect(h.disconnect).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toMatch(/^連唔到:/)
    expect(screen.getByRole('status').textContent).not.toMatch(/GATT/)
    expect(screen.queryByText('推送一次')).toBeNull()
    // 可以再試
    h.connect.mockResolvedValue()
    h.syncTime.mockResolvedValue()
    fireEvent.click(screen.getByText('連線小屏'))
    await flush()
    expect(screen.getByText('推送一次')).toBeTruthy()
  })

  it('a failed time sync does not leave dead buttons behind', async () => {
    h.connect.mockResolvedValue()
    h.syncTime.mockRejectedValue(new Error('未連線'))
    render(<ClockPush onExit={() => {}} />)
    await flush()
    fireEvent.click(screen.getByText('連線小屏'))
    await flush()
    expect(screen.getByText('推送一次')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('已連線')
    fireEvent.click(screen.getByText('斷開'))
    await flush()
    expect(h.disconnect).toHaveBeenCalledOnce()
    expect(screen.getByText('連線小屏')).toBeTruthy()
  })

  it('a push cut short by 斷開 keeps the 已斷開 message', async () => {
    let fail: (e: Error) => void = () => {}
    h.connect.mockResolvedValue()
    h.syncTime.mockResolvedValue()
    h.push.mockImplementation(() => new Promise<void>((_, rej) => (fail = rej)))
    render(<ClockPush onExit={() => {}} />)
    await flush()
    fireEvent.click(screen.getByText('連線小屏'))
    await flush()
    fireEvent.click(screen.getByText('推送一次'))
    await flush()
    expect(h.push).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByText('斷開'))
    await flush()
    await act(async () => fail(domErr('NetworkError', 'GATT Server is disconnected.')))
    expect(screen.getByRole('status').textContent).toBe('已斷開')
  })

  it('double-tapping connect only opens one chooser', async () => {
    let release: () => void = () => {}
    h.connect.mockImplementation(() => new Promise<void>((r) => (release = r)))
    h.syncTime.mockResolvedValue()
    render(<ClockPush onExit={() => {}} />)
    await flush()
    const btn = screen.getByText('連線小屏').closest('button') as HTMLButtonElement
    fireEvent.click(btn)
    fireEvent.click(btn)
    await flush()
    expect(h.made).toBe(1)
    await act(async () => release())
    expect(screen.getByText('推送一次')).toBeTruthy()
  })

  it('closing mid-connect drops the link once it comes up', async () => {
    let release: () => void = () => {}
    h.connect.mockImplementation(() => new Promise<void>((r) => (release = r)))
    const { unmount } = render(<ClockPush onExit={() => {}} />)
    await flush()
    fireEvent.click(screen.getByText('連線小屏'))
    await flush()
    unmount()
    await act(async () => release())
    // unmount 嗰下斷一次(仲未連到)+ 連到之後再斷一次
    expect(h.disconnect).toHaveBeenCalledTimes(2)
    expect(h.syncTime).not.toHaveBeenCalled()
  })
})
