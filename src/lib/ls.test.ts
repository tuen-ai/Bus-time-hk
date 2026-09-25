import { afterEach, describe, expect, it, vi } from 'vitest'
import { lsDel, lsGet, lsSet } from './ls'

describe('ls(localStorage 安全包裝)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('正常讀寫刪', () => {
    lsSet('k', 'v')
    expect(lsGet('k')).toBe('v')
    lsDel('k')
    expect(lsGet('k')).toBeNull()
  })

  it('storage 被封鎖(一掂就 SecurityError)→ 讀當冇,寫 / 刪唔拋錯', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked)
    expect(lsGet('k')).toBeNull()
    expect(() => lsSet('k', 'v')).not.toThrow()
    expect(() => lsDel('k')).not.toThrow()
  })
})
