import { describe, expect, it } from 'vitest'
import type { Weather } from '../api/weather'
import { rainLevel, warnLevel, weatherMood } from './weather'

const wx = (p: Partial<Weather>): Weather => ({
  tempC: 25,
  humidity: 70,
  warnings: [],
  rainfall: {},
  updatedAt: 0,
  ...p,
})

describe('weatherMood', () => {
  it('冇資料 → 全部 false', () => {
    expect(weatherMood(null)).toEqual({
      typhoon: false,
      rainy: false,
      hot: false,
      cold: false,
      umbrella: false,
      line: null,
    })
  })

  it('風球優先過落雨,打風都要帶遮', () => {
    const m = weatherMood(
      wx({
        warnings: [
          { code: 'TC8NE', name: '八號東北烈風或暴風信號' },
          { code: 'WRAINA', name: '黃色暴雨警告信號' },
        ],
      }),
    )
    expect(m.typhoon).toBe(true)
    expect(m.rainy).toBe(true)
    expect(m.umbrella).toBe(true)
    expect(m.line).toContain('打緊風')
  })

  it('暴雨警告或者雨量 ≥ 5mm 當落雨', () => {
    expect(weatherMood(wx({ warnings: [{ code: 'WRAINR', name: '紅雨' }] })).rainy).toBe(true)
    expect(weatherMood(wx({ rainfall: { 沙田: 5 } })).rainy).toBe(true)
    expect(weatherMood(wx({ rainfall: { 沙田: 4.9 } })).rainy).toBe(false)
  })

  it('熱 / 凍門檻,落雨時 line 講雨唔講熱', () => {
    expect(weatherMood(wx({ tempC: 33 })).hot).toBe(true)
    expect(weatherMood(wx({ tempC: 32.9 })).hot).toBe(false)
    expect(weatherMood(wx({ tempC: 12 })).cold).toBe(true)
    expect(weatherMood(wx({ tempC: null })).cold).toBe(false)
    const m = weatherMood(wx({ tempC: 34, rainfall: { 中西區: 10 } }))
    expect(m.hot).toBe(true)
    expect(m.line).toContain('落緊雨')
    expect(weatherMood(wx({ tempC: 20 })).line).toBeNull()
  })
})

describe('warnLevel', () => {
  it('黑雨 / 紅雨 / 八號或以上 / 其餘', () => {
    expect(warnLevel('WRAINB')).toBe('black')
    expect(warnLevel('WRAINR')).toBe('red')
    expect(warnLevel('WRAINA')).toBe('amber')
    expect(warnLevel('TC8SW')).toBe('red')
    expect(warnLevel('TC9')).toBe('red')
    expect(warnLevel('TC10')).toBe('red')
    expect(warnLevel('TC1')).toBe('amber')
    expect(warnLevel('TC3')).toBe('amber')
    expect(warnLevel('WHOT')).toBe('amber')
  })
})

describe('rainLevel', () => {
  it('5mm 係中雨起點(同 weatherMood 一致)', () => {
    expect(rainLevel(0)).toBe('none')
    expect(rainLevel(4.9)).toBe('light')
    expect(rainLevel(5)).toBe('moderate')
    expect(rainLevel(15)).toBe('heavy')
  })
})
