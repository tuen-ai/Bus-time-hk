import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkdClock, bleErrorText } from './skdclock'

const domErr = (name: string, message = '') => Object.assign(new Error(message), { name })

describe('bleErrorText', () => {
  it('treats a closed device chooser as a cancel', () => {
    expect(bleErrorText(domErr('NotFoundError', 'User cancelled the requestDevice() chooser.'))).toBe(
      '已取消',
    )
    expect(bleErrorText(undefined)).toBe('已取消')
  })

  it('maps Web Bluetooth errors to Cantonese instead of raw English', () => {
    expect(bleErrorText(domErr('NotFoundError', 'No Services matching UUID found in Device.'))).toMatch(
      /搵唔到小屏/,
    )
    expect(bleErrorText(domErr('SecurityError', 'Origin is not allowed'))).toMatch(/權限/)
    expect(bleErrorText(domErr('NetworkError', 'GATT Server is disconnected.'))).toMatch(/斷咗/)
    expect(bleErrorText(domErr('NotSupportedError', 'GATT operation failed'))).toMatch(/唔支援/)
    expect(bleErrorText(domErr('InvalidStateError', 'GATT operation already in progress.'))).toMatch(/忙緊/)
  })

  it('passes through the driver’s own Chinese messages', () => {
    expect(bleErrorText(new Error('未讀到屏狀態'))).toBe('未讀到屏狀態')
  })

  it('never shows an unknown English message', () => {
    const t = bleErrorText(new Error('Something weird happened'))
    expect(t).not.toMatch(/[A-Za-z]/)
  })
})

describe('SkdClock.connect', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** 假藍牙裝置:GATT 連到,但攞 service 失敗 */
  const fakeDevice = () => {
    const listeners: Record<string, () => void> = {}
    const gatt = {
      connected: false,
      connect: vi.fn(async () => {
        gatt.connected = true
        return { getPrimaryService: () => Promise.reject(domErr('NotFoundError', 'No Services found')) }
      }),
      disconnect: vi.fn(() => {
        gatt.connected = false
      }),
    }
    return {
      gatt,
      addEventListener: (t: string, cb: () => void) => {
        listeners[t] = cb
      },
      fire: (t: string) => listeners[t]?.(),
    }
  }

  it('ignores the disconnect event Chrome fires synchronously inside gatt.disconnect()', async () => {
    const dev = fakeDevice()
    // Chrome:disconnect() 入面即刻派 gattserverdisconnected(唔係之後先派)
    dev.gatt.disconnect.mockImplementation(() => {
      dev.gatt.connected = false
      dev.fire('gattserverdisconnected')
    })
    vi.stubGlobal('navigator', { bluetooth: { requestDevice: () => Promise.resolve(dev) } })
    const c = new SkdClock()
    const onDisconnect = vi.fn()
    c.onDisconnect = onDisconnect
    await expect(c.connect()).rejects.toMatchObject({ name: 'NotFoundError' })
    expect(dev.gatt.disconnect).toHaveBeenCalledOnce()
    expect(onDisconnect).not.toHaveBeenCalled()
  })

  it('drops the half-open GATT link when setup fails, without a stray disconnect callback', async () => {
    const dev = fakeDevice()
    vi.stubGlobal('navigator', { bluetooth: { requestDevice: () => Promise.resolve(dev) } })
    const c = new SkdClock()
    const onDisconnect = vi.fn()
    c.onDisconnect = onDisconnect
    await expect(c.connect()).rejects.toMatchObject({ name: 'NotFoundError' })
    expect(dev.gatt.disconnect).toHaveBeenCalledOnce()
    expect(c.connected).toBe(false)
    // Chrome 之後先派 gattserverdisconnected —— 自己斷嘅唔應該再通知
    dev.fire('gattserverdisconnected')
    expect(onDisconnect).not.toHaveBeenCalled()
  })

  it('still reports a real drop (out of range / flat battery) after a good connect', async () => {
    const listeners: Record<string, () => void> = {}
    const status = new DataView(new ArrayBuffer(16))
    status.setUint8(10, 0x12) // 三色 + 296×128
    const notify = {
      addEventListener: (_t: string, cb: (e: Event) => void) => {
        notify.cb = cb
      },
      cb: null as ((e: Event) => void) | null,
      startNotifications: async () => {
        notify.cb?.({ target: { value: status } } as unknown as Event)
        return notify
      },
      writeValue: async () => {},
    }
    const gatt = {
      connected: true,
      connect: async () => ({ getPrimaryService: async () => ({ getCharacteristic: async () => notify }) }),
      disconnect: () => {},
    }
    const dev = {
      gatt,
      addEventListener: (t: string, cb: () => void) => {
        listeners[t] = cb
      },
    }
    vi.stubGlobal('navigator', { bluetooth: { requestDevice: () => Promise.resolve(dev) } })
    const c = new SkdClock()
    const onDisconnect = vi.fn()
    c.onDisconnect = onDisconnect
    await c.connect()
    expect(c.status).toMatchObject({ width: 296, height: 128, tri: true })
    gatt.connected = false
    listeners.gattserverdisconnected?.()
    expect(onDisconnect).toHaveBeenCalledOnce()
  })
})
