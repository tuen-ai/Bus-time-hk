import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetGeoForTests, geoPermission, getRecentFix } from './geo'

const fix = (lat: number, lng: number) =>
  ({ coords: { latitude: lat, longitude: lng } }) as GeolocationPosition

let getCurrentPosition: ReturnType<typeof vi.fn>

beforeEach(() => {
  _resetGeoForTests()
  getCurrentPosition = vi.fn((ok: PositionCallback) => ok(fix(22.3, 114.17)))
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition, watchPosition: vi.fn(), clearWatch: vi.fn() },
  })
})
afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined })
})

describe('getRecentFix', () => {
  it('啱啱定過位就即刻用返,唔再問 GPS', async () => {
    expect(await getRecentFix()).toEqual({ lat: 22.3, lng: 114.17 })
    expect(await getRecentFix()).toEqual({ lat: 22.3, lng: 114.17 })
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('過咗 maxAge 就重新定位', async () => {
    vi.useFakeTimers()
    await getRecentFix(60_000)
    vi.advanceTimersByTime(61_000)
    getCurrentPosition.mockImplementation((ok: PositionCallback) => ok(fix(22.28, 114.15)))
    expect(await getRecentFix(60_000)).toEqual({ lat: 22.28, lng: 114.15 })
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
  })

  it('拒絕定位照拋出去(畀 caller 判斷唔好再煩)', async () => {
    getCurrentPosition.mockImplementation((_ok: PositionCallback, err: PositionErrorCallback) =>
      err({ code: 1, message: 'denied' } as GeolocationPositionError),
    )
    await expect(getRecentFix()).rejects.toMatchObject({ code: 1 })
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
