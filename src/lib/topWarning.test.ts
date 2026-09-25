import { describe, expect, it } from 'vitest'
import { topWarning, warnRank } from './topWarning'

const w = (code: string, name = code) => ({ code, name })

describe('warnRank', () => {
  it('黑雨 > 八號 / 紅雨 > 黃色警告', () => {
    expect(warnRank('WRAINB')).toBeGreaterThan(warnRank('TC8NE'))
    expect(warnRank('TC8NE')).toBeGreaterThan(warnRank('WRAINR'))
    expect(warnRank('WRAINR')).toBeGreaterThan(warnRank('TC3'))
    expect(warnRank('TC10')).toBeGreaterThan(warnRank('WRAINA'))
  })
  it('同係黃色:風球行先', () => {
    expect(warnRank('TC3')).toBeGreaterThan(warnRank('WL'))
    expect(warnRank('TC1')).toBeGreaterThan(warnRank('WHOT'))
    expect(warnRank('WL')).toBe(warnRank('WHOT'))
  })
})

describe('topWarning', () => {
  it('冇警告 → null', () => {
    expect(topWarning([])).toBeNull()
    expect(topWarning(null)).toBeNull()
    expect(topWarning(undefined)).toBeNull()
  })
  it('唔跟 HKO 次序:山泥 / 酷熱排前都係揀八號', () => {
    const ws = [w('WL', '山泥傾瀉警告'), w('WHOT', '酷熱天氣警告'), w('TC8NE', '八號東北烈風或暴風信號')]
    expect(topWarning(ws)?.name).toBe('八號東北烈風或暴風信號')
  })
  it('黑雨壓過八號', () => {
    expect(topWarning([w('TC8SE'), w('WRAINB')])?.code).toBe('WRAINB')
  })
  it('同分:保留原本次序', () => {
    expect(topWarning([w('WL', 'a'), w('WHOT', 'b')])?.name).toBe('a')
  })
})
