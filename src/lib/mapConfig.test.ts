import { afterEach, describe, expect, it } from 'vitest'
import { isTouchMap } from './mapConfig'

const setPointer = (coarse: boolean | null) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value:
      coarse == null
        ? undefined
        : (q: string) => ({ matches: q === '(pointer: coarse)' && coarse, media: q }),
  })
}

describe('isTouchMap', () => {
  afterEach(() => setPointer(null))

  it('手指為主(pointer: coarse,例如桌面模式 iPad)→ true', () => {
    setPointer(true)
    expect(isTouchMap()).toBe(true)
  })

  it('滑鼠 / 觸控板 → false', () => {
    setPointer(false)
    expect(isTouchMap()).toBe(false)
  })

  it('冇 matchMedia(舊瀏覽器 / 測試環境)→ 當唔係觸控,唔會爆', () => {
    setPointer(null)
    expect(isTouchMap()).toBe(false)
  })
})
