import { describe, expect, it } from 'vitest'
import { zhErrorOr } from './errorText'
import { HttpError, friendlyError } from './http'

describe('zhErrorOr', () => {
  it('自己拋嘅中文錯誤照出', () => {
    expect(zhErrorOr(new Error('唔係可可出行嘅備份檔'), 'x')).toBe('唔係可可出行嘅備份檔')
    expect(zhErrorOr('港鐵資料格式異常', 'x')).toBe('港鐵資料格式異常')
  })

  it('英文原文(JSON.parse / fetch)唔畀用家睇,用 fallback', () => {
    let parseErr: unknown
    try {
      JSON.parse('{oops')
    } catch (e) {
      parseErr = e
    }
    expect(zhErrorOr(parseErr, '檔案壞咗')).toBe('檔案壞咗')
    expect(zhErrorOr(new TypeError('Failed to fetch'), '連唔到')).toBe('連唔到')
  })

  it('HttpError 配 friendlyError 做 fallback → 廣東話', () => {
    const e = new HttpError(503, 'https://x')
    expect(zhErrorOr(e, friendlyError(e))).toBe('伺服器暫時冇回應(503)')
  })

  it('唔係 Error 嘅嘢(null / 物件)→ fallback', () => {
    expect(zhErrorOr(null, 'fb')).toBe('fb')
    expect(zhErrorOr({ message: '中文' }, 'fb')).toBe('fb')
  })
})
