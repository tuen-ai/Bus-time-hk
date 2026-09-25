import { describe, expect, it } from 'vitest'
import type { Eta } from '../api/bus'
import {
  BUFFER_MIN,
  WALK_MPM,
  catchPlan,
  catchPlanMins,
  catchPlanMs,
  validWalk,
  walkFromDist,
} from './catchable'
import { WALK_MPM as JOURNEY_WALK_MPM } from './journey'

const T0 = Date.UTC(2026, 8, 25, 0, 0, 0) // 2026-09-25 08:00 HKT
const MIN = 60_000
const at = (mins: number) => T0 + mins * MIN

const eta = (iso: string | null, seq = 1): Eta => ({
  co: 'kmb',
  route: '1A',
  dir: 'O',
  service_type: 1,
  seq: 1,
  dest_tc: '',
  eta_seq: seq,
  eta: iso,
  rmk_tc: '',
  data_timestamp: '',
})

describe('catchPlanMs:用毫秒比,唔用四捨五入分鐘', () => {
  it('冇班次 → 冇得趕,唔會爆', () => {
    expect(catchPlanMs([], 5, T0)).toEqual({
      missed: [],
      catchIdx: null,
      leaveAt: null,
      slackMs: null,
      leaveNow: false,
    })
  })

  it('全部趕唔切 → catchIdx null,逐班標 missed', () => {
    const p = catchPlanMs([at(2), at(5), at(9)], 10, T0)
    expect(p.missed).toEqual([true, true, true])
    expect(p.catchIdx).toBeNull()
    expect(p.leaveAt).toBeNull()
    expect(p.leaveNow).toBe(false)
  })

  it('第一班趕唔切、第二班趕到:最遲出門 = 到站 − 步行 − 1 分鐘預留', () => {
    const p = catchPlanMs([at(3), at(12), at(20)], 6, T0)
    expect(p.missed).toEqual([true, false, false])
    expect(p.catchIdx).toBe(1)
    expect(p.leaveAt).toBe(at(12 - 6 - BUFFER_MIN))
    expect(p.slackMs).toBe(5 * MIN)
    expect(p.leaveNow).toBe(false)
  })

  it('邊界(毫秒):啱啱夠 = 趕到;差 1 毫秒 = 趕唔切', () => {
    const need = (5 + BUFFER_MIN) * MIN
    const ok = catchPlanMs([T0 + need], 5, T0)
    expect(ok.missed).toEqual([false])
    expect(ok.catchIdx).toBe(0)
    expect(ok.leaveAt).toBe(T0)
    expect(ok.leaveNow).toBe(true)

    const miss = catchPlanMs([T0 + need - 1], 5, T0)
    expect(miss.missed).toEqual([true])
    expect(miss.catchIdx).toBeNull()
  })

  it('鬆動 ≤ 1 分鐘先叫「即刻出門」', () => {
    expect(catchPlanMs([at(7)], 5, T0).leaveNow).toBe(true) // 鬆動啱啱 1 分鐘
    expect(catchPlanMs([at(7) + 1], 5, T0).leaveNow).toBe(false)
  })

  it('冇時間嘅班次:唔當趕唔切,亦唔揀佢做「搭呢班」', () => {
    const p = catchPlanMs([null, at(2), NaN, at(10)], 4, T0)
    expect(p.missed).toEqual([false, true, false, false])
    expect(p.catchIdx).toBe(3)
  })

  it('步行 0:只計 1 分鐘預留(即將到站嗰班趕唔切)', () => {
    const p = catchPlanMs([at(0.5), at(1), at(4)], 0, T0)
    expect(p.missed).toEqual([true, false, false])
    expect(p.catchIdx).toBe(1)
    expect(p.leaveAt).toBe(T0)
  })

  it('負數步行當 0;預留可以改', () => {
    expect(catchPlanMs([at(1)], -3, T0).catchIdx).toBe(0)
    expect(catchPlanMs([at(1)], 0, T0, 0).leaveAt).toBe(at(1))
  })
})

describe('catchPlan:ETA 列表', () => {
  it('ISO 時間轉毫秒;null / 亂碼 eta 唔計', () => {
    const now = T0 + 20_000 // 08:00:20
    const etas = [
      eta(new Date(at(4)).toISOString()),
      eta(null),
      eta('not-a-date'),
      eta(new Date(at(9)).toISOString()),
    ]
    const p = catchPlan(etas, 5, now)
    expect(p.missed).toEqual([true, false, false, false])
    expect(p.catchIdx).toBe(3)
    expect(p.leaveAt).toBe(at(9 - 5 - 1))
  })
})

describe('catchPlanMins:附近嘅整數分鐘', () => {
  it('分鐘 < 步行 + 1 就趕唔切', () => {
    expect(catchPlanMins([0, 2, 3, 8], 2)).toEqual({ missed: [true, true, false, false], catchIdx: 2 })
  })
  it('冇班次 / 全部趕唔切', () => {
    expect(catchPlanMins([], 3)).toEqual({ missed: [], catchIdx: null })
    expect(catchPlanMins([1, 2], 3)).toEqual({ missed: [true, true], catchIdx: null })
  })
})

describe('walkFromDist', () => {
  it('同行程規劃用同一個步速', () => {
    expect(JOURNEY_WALK_MPM).toBe(WALK_MPM)
  })
  it('直線 × 1.25 ÷ 步速,向上取整(寧願早啲出門)', () => {
    expect(walkFromDist(80)).toBe(Math.ceil((80 * 1.25) / WALK_MPM))
    expect(walkFromDist(1)).toBe(1)
    expect(walkFromDist(WALK_MPM / 1.25)).toBe(1) // 啱啱 1 分鐘
    expect(walkFromDist(WALK_MPM / 1.25 + 1)).toBe(2)
    expect(walkFromDist(400)).toBe(Math.ceil(500 / WALK_MPM))
  })
  it('0 / 負數 / NaN → 0', () => {
    expect(walkFromDist(0)).toBe(0)
    expect(walkFromDist(-5)).toBe(0)
    expect(walkFromDist(NaN)).toBe(0)
  })
})

describe('validWalk', () => {
  it('1–30 嘅數字先算,四捨五入、上限 30', () => {
    expect(validWalk(5)).toBe(5)
    expect(validWalk(4.6)).toBe(5)
    expect(validWalk(45)).toBe(30)
  })
  it('0 / 負數 / 字串 / null → 未設定', () => {
    expect(validWalk(0)).toBeUndefined()
    expect(validWalk(-2)).toBeUndefined()
    expect(validWalk(0.4)).toBeUndefined()
    expect(validWalk('5')).toBeUndefined()
    expect(validWalk(null)).toBeUndefined()
    expect(validWalk(Infinity)).toBeUndefined()
  })
})
