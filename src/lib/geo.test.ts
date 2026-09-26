import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetGeoForTests, geoPermission, getNearbyFix } from './geo'

const fix = (lat: number, lng: number, accuracy?: number) =>
  ({ coords: { latitude: lat, longitude: lng, accuracy } }) as GeolocationPosition

let getCurrentPosition: ReturnType<typeof vi.fn>
let watchPosition: ReturnType<typeof vi.fn>
let clearWatch: ReturnType<typeof vi.fn>
/** 模擬 GPS:喺第 ms 毫秒送出一個位置(watchPosition 開咗先生效) */
let gpsPlan: { ms: number; pos: GeolocationPosition }[] = []

beforeEach(() => {
  vi.useFakeTimers()
  _resetGeoForTests()
  gpsPlan = []
  getCurrentPosition = vi.fn((ok: PositionCallback) => ok(fix(22.3, 114.17)))
  watchPosition = vi.fn((ok: PositionCallback) => {
    for (const p of gpsPlan) setTimeout(() => ok(p.pos), p.ms)
    return 7
  })
  clearWatch = vi.fn()
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition, watchPosition, clearWatch },
  })
})
afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined })
})

describe('getNearbyFix(最近你嘅站:要準)', () => {
  it('高精度定位一去到 30 米內就即刻用,唔使等夠 5 秒', async () => {
    gpsPlan = [
      { ms: 300, pos: fix(22.31, 114.16, 80) },
      { ms: 900, pos: fix(22.3196, 114.169, 12) },
    ]
    const p = getNearbyFix()
    await vi.advanceTimersByTimeAsync(900)
    expect(await p).toEqual({ lat: 22.3196, lng: 114.169 })
    expect(watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      maximumAge: 10_000,
    })
    expect(clearWatch).toHaveBeenCalledWith(7)
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('5 秒內都唔夠準:用暫時最準嗰個', async () => {
    gpsPlan = [
      { ms: 500, pos: fix(22.33, 114.15, 400) },
      { ms: 1500, pos: fix(22.32, 114.168, 60) },
      { ms: 2500, pos: fix(22.31, 114.16, 150) },
    ]
    const p = getNearbyFix()
    await vi.advanceTimersByTimeAsync(5000)
    expect(await p).toEqual({ lat: 22.32, lng: 114.168 })
    expect(clearWatch).toHaveBeenCalledWith(7)
  })

  it('5 秒都冇任何位置(室內):退返低精度 / 快取定位', async () => {
    const p = getNearbyFix()
    await vi.advanceTimersByTimeAsync(5000)
    expect(await p).toEqual({ lat: 22.3, lng: 114.17 })
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('30 秒內嘅準確定位直接用返;過咗 30 秒或者唔夠準就重新定位', async () => {
    gpsPlan = [{ ms: 100, pos: fix(22.3196, 114.169, 10) }]
    let p = getNearbyFix()
    await vi.advanceTimersByTimeAsync(100)
    await p
    expect(await getNearbyFix()).toEqual({ lat: 22.3196, lng: 114.169 })
    expect(watchPosition).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(31_000)
    gpsPlan = [{ ms: 100, pos: fix(22.28, 114.15, 70) }]
    p = getNearbyFix()
    await vi.advanceTimersByTimeAsync(5000)
    expect(await p).toEqual({ lat: 22.28, lng: 114.15 })
    expect(watchPosition).toHaveBeenCalledTimes(2)

    // 上一個得 70 米準:唔會直接用返
    p = getNearbyFix()
    await vi.advanceTimersByTimeAsync(5000)
    await p
    expect(watchPosition).toHaveBeenCalledTimes(3)
  })

  it('拒絕定位即刻拋出去(唔使等 5 秒,亦唔會再試低精度)', async () => {
    watchPosition.mockImplementation((_ok: PositionCallback, err: PositionErrorCallback) => {
      setTimeout(() => err({ code: 1, message: 'denied' } as GeolocationPositionError), 50)
      return 7
    })
    const p = getNearbyFix()
    const check = expect(p).rejects.toMatchObject({ code: 1 })
    await vi.advanceTimersByTimeAsync(50)
    await check
    expect(clearWatch).toHaveBeenCalledWith(7)
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('暫時冇訊號嘅錯誤唔會即刻放棄,之後有 fix 照用', async () => {
    watchPosition.mockImplementation((ok: PositionCallback, err: PositionErrorCallback) => {
      setTimeout(() => err({ code: 2, message: 'unavailable' } as GeolocationPositionError), 100)
      setTimeout(() => ok(fix(22.3196, 114.169, 20)), 1200)
      return 7
    })
    const p = getNearbyFix()
    await vi.advanceTimersByTimeAsync(1200)
    expect(await p).toEqual({ lat: 22.3196, lng: 114.169 })
  })

  it('同步 callback 嘅實作都會清走 watch', async () => {
    watchPosition.mockImplementation((ok: PositionCallback) => {
      ok(fix(22.3196, 114.169, 5))
      return 9
    })
    expect(await getNearbyFix()).toEqual({ lat: 22.3196, lng: 114.169 })
    expect(clearWatch).toHaveBeenCalledWith(9)
  })
})

describe('geoPermission', () => {
  it('冇 Permissions API(舊 iOS)→ unknown', async () => {
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined })
    expect(await geoPermission()).toBe('unknown')
  })

  it('回傳瀏覽器嘅權限狀態;query 出錯都當 unknown', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'denied' })
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } })
    expect(await geoPermission()).toBe('denied')
    query.mockRejectedValue(new TypeError('unsupported'))
    expect(await geoPermission()).toBe('unknown')
  })
})
