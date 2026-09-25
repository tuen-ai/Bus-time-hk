import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StationSchedule, TrainArrival } from '../api/mtr'
import {
  ageMtrSnap,
  freshMtrSnap,
  getMtrFavs,
  getMtrLast,
  isMtrFav,
  keepMtrStale,
  MTR_FAVS_MAX,
  MTRFAVS_CHANGED,
  setMtrLast,
  toggleMtrFav,
  ttntLabel,
  upcomingTrains,
  type MtrFav,
} from './mtrFavs'

const KEY = 'kkcx.mtrFavs'
const TST_UP: MtrFav = { line: 'TWL', sta: 'TST', dir: 'UP' }
const TST_DOWN: MtrFav = { line: 'TWL', sta: 'TST', dir: 'DOWN' }

describe('港鐵收藏', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('toggle 一次加、兩次返原狀;同一個收藏唔會重複', () => {
    expect(toggleMtrFav(TST_UP)).toEqual([TST_UP])
    expect(isMtrFav(TST_UP)).toBe(true)
    expect(isMtrFav(TST_DOWN)).toBe(false) // 方向分開計
    expect(toggleMtrFav(TST_UP)).toEqual([])
    expect(getMtrFavs()).toEqual([])
    expect(localStorage.getItem(KEY)).toBe('[]')

    // 儲存入面有重複(例如手改 / 舊備份)→ 讀出嚟只得一個
    localStorage.setItem(KEY, JSON.stringify([TST_UP, TST_UP]))
    expect(getMtrFavs()).toEqual([TST_UP])
  })

  it('新嘅排最前;每次改都通知首頁', () => {
    const onChange = vi.fn()
    window.addEventListener(MTRFAVS_CHANGED, onChange)
    toggleMtrFav(TST_UP)
    toggleMtrFav(TST_DOWN)
    window.removeEventListener(MTRFAVS_CHANGED, onChange)
    expect(getMtrFavs()).toEqual([TST_DOWN, TST_UP])
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('壞 JSON / 唔係陣列 / 欄位唔啱 / 唔識嘅綫站 → 略過,唔會 throw', () => {
    localStorage.setItem(KEY, '{not json')
    expect(getMtrFavs()).toEqual([])
    localStorage.setItem(KEY, '{"line":"TWL"}')
    expect(getMtrFavs()).toEqual([])
    localStorage.setItem(
      KEY,
      JSON.stringify([
        null,
        'TWL',
        { line: 'TWL', sta: 'TST', dir: 'LEFT' },
        { line: 'XXX', sta: 'TST', dir: 'UP' },
        { line: 'TWL', sta: 'HOK', dir: 'UP' }, // 香港站唔喺荃灣綫
        { line: 'TWL', sta: 'TST', dir: 'UP', extra: 1 },
      ]),
    )
    expect(getMtrFavs()).toEqual([TST_UP])
  })

  it(`最多 ${MTR_FAVS_MAX} 個:滿咗唔加(原封不動),移除咗先加到`, () => {
    const four: MtrFav[] = [
      { line: 'TWL', sta: 'CEN', dir: 'UP' },
      { line: 'ISL', sta: 'CEN', dir: 'DOWN' }, // 轉車站:綫 + 站一齊對
      { line: 'KTL', sta: 'MOK', dir: 'UP' },
      { line: 'EAL', sta: 'SHT', dir: 'DOWN' },
    ]
    for (const f of four) toggleMtrFav(f)
    expect(getMtrFavs()).toHaveLength(MTR_FAVS_MAX)
    const before = localStorage.getItem(KEY)
    const onChange = vi.fn()
    window.addEventListener(MTRFAVS_CHANGED, onChange)
    expect(toggleMtrFav(TST_UP)).toHaveLength(MTR_FAVS_MAX)
    window.removeEventListener(MTRFAVS_CHANGED, onChange)
    expect(isMtrFav(TST_UP)).toBe(false)
    expect(localStorage.getItem(KEY)).toBe(before)
    expect(onChange).not.toHaveBeenCalled()

    toggleMtrFav(four[0])
    toggleMtrFav(TST_UP)
    expect(isMtrFav(TST_UP)).toBe(true)

    // 儲存入面多過上限(例如舊備份)→ 只讀頭幾個
    localStorage.setItem(KEY, JSON.stringify([...four, TST_UP, TST_DOWN]))
    expect(getMtrFavs()).toEqual(four)
  })

  it('唔識嘅站唔會加', () => {
    toggleMtrFav({ line: 'TWL', sta: 'NOPE', dir: 'UP' })
    expect(getMtrFavs()).toEqual([])
  })

  it('localStorage 被封鎖:讀當冇,toggle 唔 throw', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    expect(getMtrFavs()).toEqual([])
    expect(() => toggleMtrFav(TST_UP)).not.toThrow()
    expect(getMtrLast()).toBeNull()
    expect(() => setMtrLast({ line: 'TWL', sta: null })).not.toThrow()
  })
})

describe('鐵路頁上次揀嘅綫 / 站', () => {
  beforeEach(() => localStorage.clear())

  it('記低再讀返', () => {
    expect(getMtrLast()).toBeNull()
    setMtrLast({ line: 'ISL', sta: 'CEN' })
    expect(getMtrLast()).toEqual({ line: 'ISL', sta: 'CEN' })
    setMtrLast({ line: 'SIL', sta: null })
    expect(getMtrLast()).toEqual({ line: 'SIL', sta: null })
  })

  it('壞資料:唔識嘅綫 → null;站唔喺嗰條綫 → 淨係記綫', () => {
    localStorage.setItem('kkcx.mtr.last', 'oops')
    expect(getMtrLast()).toBeNull()
    localStorage.setItem('kkcx.mtr.last', '{"line":"XXX","sta":"TST"}')
    expect(getMtrLast()).toBeNull()
    localStorage.setItem('kkcx.mtr.last', '{"line":"TWL","sta":"HOK"}')
    expect(getMtrLast()).toEqual({ line: 'TWL', sta: null })
    localStorage.setItem('kkcx.mtr.last', '{"line":"TWL","sta":5}')
    expect(getMtrLast()).toEqual({ line: 'TWL', sta: null })
  })
})

const train = (ttnt: number, dest = 'CEN', plat = '1'): TrainArrival => ({
  dest,
  plat,
  ttnt,
  time: '',
  seq: 1,
})
const SCHED: StationSchedule = {
  up: [train(2), train(6)],
  down: [],
  sysTime: null,
  isDelay: false,
  special: false,
  message: null,
  url: null,
}
const T0 = 1_000_000_000_000

describe('首頁卡顯示', () => {
  it('ttntLabel:0 或以下 = 即將抵達', () => {
    expect(ttntLabel(0)).toBe('即將抵達')
    expect(ttntLabel(-1)).toBe('即將抵達')
    expect(ttntLabel(3)).toBe('3 分鐘')
  })

  it('upcomingTrains:新鮮資料原樣取頭 n 班;舊資料扣返分鐘、開咗嘅唔要', () => {
    const list = [train(0), train(3), train(7), train(11)]
    expect(upcomingTrains(list, 20_000)).toEqual([train(0), train(3)])
    expect(upcomingTrains(list, 20_000, 3)).toHaveLength(3)
    expect(upcomingTrains(list, 2 * 60_000 + 5_000)).toEqual([train(1), train(5)])
    expect(upcomingTrains(list, 20 * 60_000)).toEqual([])
    expect(upcomingTrains([], 0)).toEqual([])
  })

  it('keepMtrStale:5 分鐘內留舊時間表,再舊 / 從未成功就淨係報錯', () => {
    const ok = freshMtrSnap(SCHED, T0)
    expect(keepMtrStale(ok, '網絡太慢', T0 + 60_000)).toEqual({
      sched: SCHED,
      fetchedAt: T0,
      error: '網絡太慢',
      at: T0 + 60_000,
    })
    expect(keepMtrStale(ok, '網絡太慢', T0 + 6 * 60_000)).toEqual({
      sched: null,
      fetchedAt: null,
      error: '網絡太慢',
      at: T0 + 6 * 60_000,
    })
    expect(keepMtrStale(undefined, 'x', T0).sched).toBeNull()
  })

  it('ageMtrSnap:啱啱更新唔郁;舊過 1 分鐘重計;超過 5 分鐘掉(有錯誤就變錯誤)', () => {
    const ok = freshMtrSnap(SCHED, T0)
    expect(ageMtrSnap(ok, T0 + 30_000)).toBe(ok)
    expect(ageMtrSnap(ok, T0 + 90_000)).toEqual({ ...ok, at: T0 + 90_000 })
    expect(ageMtrSnap(ok, T0 + 6 * 60_000)).toBeUndefined()
    const stale = keepMtrStale(ok, '網絡太慢', T0 + 20_000)
    expect(ageMtrSnap(stale, T0 + 6 * 60_000)).toEqual({
      sched: null,
      fetchedAt: null,
      error: '網絡太慢',
      at: T0 + 6 * 60_000,
    })
    const failed = keepMtrStale(undefined, 'x', T0)
    expect(ageMtrSnap(failed, T0 + 10 * 60_000)).toBe(failed)
    expect(ageMtrSnap(undefined, T0)).toBeUndefined()
  })
})
