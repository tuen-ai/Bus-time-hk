import { beforeEach, describe, expect, it } from 'vitest'
import { importBackup, makeBackup } from './backup'

describe('backup', () => {
  beforeEach(() => localStorage.clear())

  it('匯出 → 匯入 round-trip,包括金句同附近偏好', () => {
    localStorage.setItem('kmb.favorites', '[{"route":"1A"}]')
    localStorage.setItem('kkcx.quote', '{"mode":"fixed","idx":3}')
    localStorage.setItem('kkcx.nearby.co', 'ctb')
    localStorage.setItem('bus.routes', 'big-cache-should-not-be-backed-up')
    const json = makeBackup()
    localStorage.clear()
    expect(importBackup(json)).toBe(3)
    expect(localStorage.getItem('kmb.favorites')).toBe('[{"route":"1A"}]')
    expect(localStorage.getItem('kkcx.quote')).toBe('{"mode":"fixed","idx":3}')
    expect(localStorage.getItem('kkcx.nearby.co')).toBe('ctb')
    expect(localStorage.getItem('bus.routes')).toBeNull()
  })

  it('唔係本 app 嘅檔 / 冇資料 → 拋錯', () => {
    expect(() => importBackup('{"app":"other","data":{}}')).toThrow()
    expect(() => importBackup('{"app":"kkcx","data":{"evil.key":"x"}}')).toThrow('冇資料')
  })
})
