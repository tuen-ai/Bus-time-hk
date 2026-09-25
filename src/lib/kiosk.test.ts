import { describe, expect, it } from 'vitest'
import type { Eta } from '../api/bus'
import { OFFLINE_MS, STALE_MS, mergeRow, msToNextMinute, rowView, type RowEta } from './kiosk'

const T0 = Date.parse('2026-09-25T08:00:00+08:00')
const eta = (atMs: number | null, seq = 1): Eta => ({
  co: 'kmb',
  route: '1A',
  dir: 'O',
  service_type: 1,
  seq: 1,
  dest_tc: '中秀茂坪',
  eta_seq: seq,
  eta: atMs == null ? null : new Date(atMs).toISOString(),
  rmk_tc: '',
  data_timestamp: '',
})
const min = (n: number) => T0 + n * 60_000

describe('mergeRow', () => {
  it('stores a success and resets the failure count', () => {
    const prev: RowEta = { etas: [eta(min(3))], okAt: T0 - 20_000, fails: 3 }
    const list = [eta(min(5))]
    expect(mergeRow(prev, T0, list)).toEqual({ etas: list, okAt: T0, fails: 0 })
  })

  it('keeps the last good ETAs and counts failures', () => {
    const list = [eta(min(3))]
    const a = mergeRow(undefined, T0, list)
    const b = mergeRow(a, T0 + 10_000, null)
    const c = mergeRow(b, T0 + 20_000, null)
    expect(c).toEqual({ etas: list, okAt: T0, fails: 2 })
  })

  it('counts failures for a row that never loaded', () => {
    const a = mergeRow(undefined, T0, null)
    expect(mergeRow(a, T0 + 10_000, null)).toEqual({ etas: null, okAt: 0, fails: 2 })
  })

  it('ignores a late result from an older request', () => {
    const fresh: RowEta = { etas: [eta(min(2))], okAt: T0 + 10_000, fails: 0 }
    expect(mergeRow(fresh, T0, [eta(min(9))])).toBe(fresh)
    expect(mergeRow(fresh, T0, null)).toBe(fresh)
  })
})

describe('rowView', () => {
  it('is loading before the first result', () => {
    expect(rowView(undefined, T0)).toEqual({ state: 'loading', mins: [] })
    expect(rowView({ etas: null, okAt: 0, fails: 1 }, T0).state).toBe('loading')
  })

  it('shows offline when a row has never loaded after repeated failures', () => {
    expect(rowView({ etas: null, okAt: 0, fails: 2 }, T0)).toEqual({ state: 'offline', mins: [] })
  })

  it('recomputes minutes from absolute times so they count down', () => {
    const row: RowEta = { etas: [eta(min(8)), eta(min(3)), eta(null)], okAt: T0, fails: 0 }
    expect(rowView(row, T0)).toEqual({ state: 'live', mins: [3, 8] })
    // 兩分鐘後(資料仍然新):分鐘自己減
    const later = { ...row, okAt: min(2) }
    expect(rowView(later, min(2)).mins).toEqual([1, 6])
  })

  it('drops buses that have left and still shows the next three', () => {
    const row: RowEta = {
      etas: [eta(min(1)), eta(min(4)), eta(min(9)), eta(min(15))],
      okAt: min(5),
      fails: 0,
    }
    expect(rowView(row, min(5)).mins).toEqual([-1, 4, 10])
    expect(rowView({ ...row, okAt: min(7) }, min(7)).mins).toEqual([2, 8])
  })

  it('marks a row stale after two failed refreshes but keeps counting down', () => {
    const row: RowEta = { etas: [eta(min(6))], okAt: T0, fails: 2 }
    expect(rowView(row, T0 + 20_000)).toEqual({ state: 'stale', mins: [6] })
  })

  it('marks a row stale when data is old even without recorded failures (hung request)', () => {
    const row: RowEta = { etas: [eta(min(6))], okAt: T0, fails: 0 }
    expect(rowView(row, T0 + STALE_MS - 1).state).toBe('live')
    expect(rowView(row, T0 + STALE_MS + 1).state).toBe('stale')
  })

  it('stops showing minutes once the data is too old to trust', () => {
    const row: RowEta = { etas: [eta(min(20))], okAt: T0, fails: 30 }
    expect(rowView(row, T0 + OFFLINE_MS + 1)).toEqual({ state: 'offline', mins: [] })
  })

  it('says offline (not 冇班次) when a stale row has run out of buses', () => {
    const row: RowEta = { etas: [eta(min(1))], okAt: T0, fails: 2 }
    expect(rowView(row, min(4))).toEqual({ state: 'offline', mins: [] })
  })

  it('says no buses only when the data is live', () => {
    expect(rowView({ etas: [], okAt: T0, fails: 0 }, T0)).toEqual({ state: 'live', mins: [] })
  })
})

describe('msToNextMinute', () => {
  it('waits until just past the next minute boundary', () => {
    expect(msToNextMinute(T0 + 59_000)).toBe(1_050)
    expect(msToNextMinute(T0)).toBe(60_050)
    const at = T0 + 12_345
    expect((at + msToNextMinute(at)) % 60_000).toBe(50)
  })
})
