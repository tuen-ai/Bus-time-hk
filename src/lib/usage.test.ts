import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordUse, suggest } from './usage'

// 2026-09-07 係星期一
const MON_0830 = new Date(2026, 8, 7, 8, 30)
const SAT_0830 = new Date(2026, 8, 5, 8, 30)

const rec = (route: string, at: Date, stopId?: string) => {
  vi.setSystemTime(at)
  recordUse({ co: 'kmb', route, bound: 'O', serviceType: '1', stopId })
}

describe('usage.suggest', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })

  it('少過 3 條記錄唔推薦', () => {
    rec('1A', MON_0830)
    rec('1A', MON_0830)
    expect(suggest(MON_0830)).toEqual([])
  })

  it('同一時段 + 平日先推薦,hits ≥ 2', () => {
    rec('1A', MON_0830)
    rec('1A', new Date(2026, 8, 8, 8, 50)) // 星期二
    rec('269D', MON_0830) // 得一次 → 唔推
    rec('N269', new Date(2026, 8, 7, 23, 0)) // 深夜,時段唔啱
    const s = suggest(MON_0830)
    expect(s.map((x) => x.route)).toEqual(['1A'])
    expect(s[0].hits).toBe(2)
  })

  it('假日記錄唔會喺平日推', () => {
    rec('1A', SAT_0830)
    rec('1A', SAT_0830)
    rec('1A', SAT_0830)
    expect(suggest(MON_0830)).toEqual([])
    expect(suggest(SAT_0830).map((x) => x.route)).toEqual(['1A'])
  })

  it('用最近嗰個站', () => {
    rec('1A', MON_0830, 'S1')
    rec('1A', new Date(2026, 8, 8, 8, 30), 'S2')
    rec('1A', new Date(2026, 8, 9, 8, 30), 'S3')
    expect(suggest(MON_0830)[0].stopId).toBe('S3')
  })
})
