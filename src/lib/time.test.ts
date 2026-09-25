import { describe, expect, it } from 'vitest'
import type { Eta } from '../api/bus'
import {
  STALE_MAX_MS,
  ageSnapshot,
  clockLabel,
  etaLabel,
  freshEtas,
  keepStale,
  minutesUntil,
  nextEtas,
  type EtaSnapshot,
} from './time'

const T0 = Date.UTC(2026, 8, 3, 0, 0, 0) // 2026-09-03 08:00 HKT

const eta = (mins: number | null, seq = 1): Eta => ({
  co: 'kmb',
  route: '1A',
  dir: 'O',
  service_type: 1,
  seq: 1,
  dest_tc: '中秀茂坪',
  eta_seq: seq,
  eta: mins == null ? null : new Date(T0 + mins * 60_000).toISOString(),
  rmk_tc: '',
  data_timestamp: '',
})

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

describe('nextEtas', () => {
  it('按時間排,冇時間排最尾,最多 3 班', () => {
    const out = nextEtas([eta(null, 1), eta(9, 2), eta(3, 3), eta(15, 4), eta(20, 5)])
    expect(out.map((e) => e.eta_seq)).toEqual([3, 2, 4])
  })
  it('同一時間睇 eta_seq;全部冇時間照 eta_seq', () => {
    expect(nextEtas([eta(5, 2), eta(5, 1)]).map((e) => e.eta_seq)).toEqual([1, 2])
    expect(nextEtas([eta(null, 2), eta(null, 1)]).map((e) => e.eta_seq)).toEqual([1, 2])
  })
  it('唔改原本陣列', () => {
    const src = [eta(9, 1), eta(3, 2)]
    nextEtas(src)
    expect(src.map((e) => e.eta_seq)).toEqual([1, 2])
  })
})

describe('freshEtas', () => {
  it('去走過咗超過 1 分鐘嘅班次,冇時間嘅照留', () => {
    const out = freshEtas([eta(-3, 1), eta(-0.5, 2), eta(4, 3), eta(null, 4)], T0)
    expect(out.map((e) => e.eta_seq)).toEqual([2, 3, 4])
  })
  it('graceMs 可以改', () => {
    expect(freshEtas([eta(-0.5, 1), eta(2, 2)], T0, 0).map((e) => e.eta_seq)).toEqual([2])
  })
})

describe('keepStale', () => {
  const ok = (at: number, etas = [eta(-3, 1), eta(2, 2), eta(8, 3)]): EtaSnapshot => ({
    etas,
    fetchedAt: at,
    error: null,
  })

  it('從未成功 → 淨係錯誤', () => {
    expect(keepStale(undefined, '冇網絡連線', T0)).toEqual({ etas: [], fetchedAt: null, error: '冇網絡連線' })
    expect(keepStale(null, 'x', T0).fetchedAt).toBeNull()
  })

  it('5 分鐘內成功過 → 保留舊班次(去走過咗嘅)+ 記住錯誤,fetchedAt 唔變', () => {
    const prev = ok(T0 - 60_000)
    const out = keepStale(prev, '網絡太慢', T0)
    expect(out.fetchedAt).toBe(T0 - 60_000)
    expect(out.error).toBe('網絡太慢')
    expect(out.etas.map((e) => e.eta_seq)).toEqual([2, 3])
  })

  it('連續失敗:以第一次失敗前嘅成功時間計,過咗 5 分鐘就掉', () => {
    const first = keepStale(ok(T0), 'x', T0 + 5_000)
    const again = keepStale(first, 'x', T0 + STALE_MAX_MS)
    expect(again.fetchedAt).toBe(T0)
    const tooOld = keepStale(again, 'x', T0 + STALE_MAX_MS + 1)
    expect(tooOld).toEqual({ etas: [], fetchedAt: null, error: 'x' })
  })

  it('舊資料太舊掉咗之後再失敗 → 仍然係錯誤', () => {
    const dead: EtaSnapshot = { etas: [], fetchedAt: null, error: 'x' }
    expect(keepStale(dead, 'y', T0)).toEqual({ etas: [], fetchedAt: null, error: 'y' })
  })
})

describe('ageSnapshot', () => {
  const snap = (at: number | null, error: string | null = null): EtaSnapshot => ({
    etas: [eta(-3, 1), eta(2, 2), eta(8, 3)],
    fetchedAt: at,
    error,
  })

  it('冇資料 / 淨係錯誤 → 原封不動', () => {
    expect(ageSnapshot(undefined, T0)).toBeNull()
    expect(ageSnapshot(null, T0)).toBeNull()
    const err = snap(null, 'x')
    expect(ageSnapshot(err, T0)).toBe(err)
  })

  it('一分鐘內啱啱攞過(正常輪詢)→ 同一個 object,唔好執走 API 帶嘅啱啱開出嘅車', () => {
    const s = snap(T0 - 59_000)
    expect(ageSnapshot(s, T0)).toBe(s)
  })

  it('一分鐘至 5 分鐘 → 新 object,去走過咗嘅班次,fetchedAt / error 照留', () => {
    const s = snap(T0 - 2 * 60_000, '網絡太慢')
    const out = ageSnapshot(s, T0)
    expect(out).not.toBe(s)
    expect(out?.etas.map((e) => e.eta_seq)).toEqual([2, 3])
    expect(out?.fetchedAt).toBe(T0 - 2 * 60_000)
    expect(out?.error).toBe('網絡太慢')
  })

  it('超過 5 分鐘 → null(當冇,等新資料);本身已經攞唔到就直接變錯誤', () => {
    expect(ageSnapshot(snap(T0 - STALE_MAX_MS - 1), T0)).toBeNull()
    expect(ageSnapshot(snap(T0 - STALE_MAX_MS - 1, 'x'), T0)).toEqual({
      etas: [],
      fetchedAt: null,
      error: 'x',
    })
  })
})
