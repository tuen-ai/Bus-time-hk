import { describe, expect, it } from 'vitest'
import { busIcon } from './mapIcons'

describe('busIcon', () => {
  it('同一個 label 重用同一個 icon(react-leaflet 見 icon 冇變就唔會重建 DOM)', () => {
    expect(busIcon('3分')).toBe(busIcon('3分'))
    expect(busIcon('3分', false)).toBe(busIcon('3分', false))
  })

  it('label 或者主 / 副車唔同 → 唔同 icon', () => {
    expect(busIcon('3分')).not.toBe(busIcon('2分'))
    expect(busIcon('3分', true)).not.toBe(busIcon('3分', false))
    expect(busIcon('3分', false).options.className).toContain('secondary')
  })

  it('🚌 唔讀出嚟,分鐘唔會斷開兩行', () => {
    const html = String(busIcon('12分').options.html)
    expect(html).toContain('<span aria-hidden="true">🚌</span>')
    expect(html).toContain('white-space:nowrap')
    expect(html).toContain('12分')
  })
})
