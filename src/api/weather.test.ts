import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildWeather, parseWarnings } from './weather'

const WARN = { WTCSGNL: { name: '八號東北烈風或暴風信號', code: 'TC8NE', actionCode: 'ISSUE' } }
const CURRENT = {
  temperature: {
    data: [
      { place: '京士柏', value: 27 },
      { place: '香港天文台', value: 28 },
    ],
  },
  humidity: { data: [{ place: '香港天文台', value: 88 }] },
  rainfall: { data: [{ place: '中西區', max: 12 }] },
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('parseWarnings / buildWeather', () => {
  it('CANCEL 咗 / 冇名嘅警告唔要', () => {
    expect(
      parseWarnings({
        a: { name: '黃雨', code: 'WRAINA', actionCode: 'ISSUE' },
        b: { name: '三號', code: 'TC3', actionCode: 'CANCEL' },
        c: { code: 'WHOT' },
        d: null,
      }),
    ).toEqual([{ code: 'WRAINA', name: '黃雨' }])
  })

  it('氣溫優先用香港天文台站;雨量按分區', () => {
    const w = buildWeather(WARN, CURRENT, 123)
    expect(w).toEqual({
      tempC: 28,
      humidity: 88,
      warnings: [{ code: 'TC8NE', name: '八號東北烈風或暴風信號' }],
      rainfall: { 中西區: 12 },
      updatedAt: 123,
    })
    expect(buildWeather({}, {}).tempC).toBeNull()
  })
})

describe('getWeather(失敗唔可以扮「冇警告」)', () => {
  let failWarn = false
  let failCurrent = false

  beforeEach(() => {
    vi.resetModules() // 每個 test 全新 memo / 上次資料
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
    failWarn = false
    failCurrent = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('warnsum')) return failWarn ? json('down', 503) : json(WARN)
      if (failCurrent) throw new TypeError('Failed to fetch')
      return json(CURRENT)
    })
  })
  afterEach(() => vi.useRealTimers())

  it('警告攞唔到 → 回上次成功嘅天氣(風球仲喺度)', async () => {
    const { getWeather } = await import('./weather')
    expect((await getWeather()).warnings).toHaveLength(1)
    vi.setSystemTime(5 * 60_000) // 過咗 TTL
    failWarn = true
    const w = await getWeather()
    expect(w.warnings.map((x) => x.code)).toEqual(['TC8NE'])
    expect(w.tempC).toBe(28)
  })

  it('第一次就攞唔到警告 → 拋錯(唔好顯示「天氣正常」)', async () => {
    const { getWeather } = await import('./weather')
    failWarn = true
    await expect(getWeather()).rejects.toBeTruthy()
  })

  it('即時天氣攞唔到 → 警告照更新,氣溫沿用上次', async () => {
    const { getWeather } = await import('./weather')
    await getWeather()
    vi.setSystemTime(5 * 60_000)
    failCurrent = true
    const w = await getWeather()
    expect(w.tempC).toBe(28)
    expect(w.warnings).toHaveLength(1)
  })

  it('警告失敗嗰轉攞到嘅氣溫都記低,之後即時天氣失敗就用返佢', async () => {
    const { getWeather } = await import('./weather')
    let temp = 28
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('warnsum')) return failWarn ? json('down', 503) : json(WARN)
      if (failCurrent) throw new TypeError('Failed to fetch')
      return json({ ...CURRENT, temperature: { data: [{ place: '香港天文台', value: temp }] } })
    })
    expect((await getWeather()).tempC).toBe(28)
    vi.setSystemTime(5 * 60_000)
    failWarn = true
    temp = 30
    expect((await getWeather()).tempC).toBe(28) // 成個舊值(警告冇得確認)
    failWarn = false
    failCurrent = true
    expect((await getWeather()).tempC).toBe(30)
  })

  it('TTL 短過天氣列 5 分鐘 tick', async () => {
    const { getWeather } = await import('./weather')
    await getWeather()
    const calls = vi.mocked(fetch).mock.calls.length
    vi.setSystemTime(5 * 60_000 - 1)
    await getWeather()
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(calls)
  })
})
