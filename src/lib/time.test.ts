import { describe, expect, it } from 'vitest'
import { clockLabel, etaLabel, minutesUntil } from './time'

const T0 = Date.UTC(2026, 8, 3, 0, 0, 0) // 2026-09-03 08:00 HKT

describe('minutesUntil', () => {
  it('null eta → null', () => {
    expect(minutesUntil(null, T0)).toBeNull()
  })
  it('四捨五入到分鐘', () => {
    expect(minutesUntil(new Date(T0 + 4.4 * 60_000).toISOString(), T0)).toBe(4)
    expect(minutesUntil(new Date(T0 + 4.6 * 60_000).toISOString(), T0)).toBe(5)
  })
  it('已過嘅 eta 係負數', () => {
    expect(minutesUntil(new Date(T0 - 2 * 60_000).toISOString(), T0)).toBe(-2)
  })
})

describe('etaLabel', () => {
  it('冇 eta → 暫無班次', () => {
    expect(etaLabel(null, T0)).toBe('暫無班次')
  })
  it('0 分鐘或已過 → 即將到達', () => {
    expect(etaLabel(new Date(T0).toISOString(), T0)).toBe('即將到達')
    expect(etaLabel(new Date(T0 - 60_000).toISOString(), T0)).toBe('即將到達')
  })
  it('未來 → N 分鐘', () => {
    expect(etaLabel(new Date(T0 + 7 * 60_000).toISOString(), T0)).toBe('7 分鐘')
  })
})

describe('clockLabel', () => {
  it('null → --:--', () => {
    expect(clockLabel(null)).toBe('--:--')
  })
  it('用香港時間 HH:mm', () => {
    expect(clockLabel(new Date(T0).toISOString())).toBe('08:00')
  })
})
