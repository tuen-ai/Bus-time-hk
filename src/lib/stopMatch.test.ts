import { describe, expect, it } from 'vitest'
import type { Route } from '../api/bus'
import {
  AUTO_NEAREST_MAX_M,
  MATCH_RADIUS_M,
  nearestBoardingStop,
  normStopName,
  pickCounterpartStop,
  pickReverseVariant,
} from './stopMatch'

// 0.001 度緯度 ≈ 111 米
const LAT = 22.3
const LNG = 114.17
const at = (stopId: string, name: string, dLatM: number, dLngM = 0) => ({
  stopId,
  name,
  lat: LAT + dLatM / 111_000,
  lng: LNG + dLngM / 103_000,
})
const hint = { stopId: 'here', name: '彌敦道 (KT968)', lat: LAT, lng: LNG }

describe('normStopName', () => {
  it('去九巴站碼、空格同全半形括號', () => {
    expect(normStopName('彌敦道 (KT968)')).toBe('彌敦道')
    expect(normStopName('黃大仙中心 (北館)')).toBe('黃大仙中心北館')
    expect(normStopName('黃大仙中心（北館）')).toBe('黃大仙中心北館')
    expect(normStopName(' Tai Po  Market ')).toBe('taipomarket')
  })
})

describe('pickCounterpartStop', () => {
  it('同一個 stopId 直接用(輕鐵兩個方向共用站 id)', () => {
    const stops = [at('a', '彌敦道', 50), at('here', '另一個名', 900)]
    expect(pickCounterpartStop(stops, hint)).toBe('here')
  })

  it('範圍內同名優先,就算有更近嘅唔同名站', () => {
    const stops = [at('near', '佐敦道', 40), at('same', '彌敦道 (KT969)', 180), at('far', '彌敦道', 600)]
    expect(pickCounterpartStop(stops, hint)).toBe('same')
  })

  it('同名有幾個就揀最近嗰個', () => {
    const stops = [at('s1', '彌敦道', 300), at('s2', '彌敦道', -120)]
    expect(pickCounterpartStop(stops, hint)).toBe('s2')
  })

  it('冇同名就揀範圍內最近', () => {
    const stops = [at('x', '佐敦道', 250), at('y', '加士居道', 90, 60)]
    expect(pickCounterpartStop(stops, hint)).toBe('y')
  })

  it('全部超過範圍 → null(唔自動打開)', () => {
    const stops = [at('x', '彌敦道', MATCH_RADIUS_M + 50), at('y', '佐敦道', 1200)]
    expect(pickCounterpartStop(stops, hint)).toBeNull()
  })

  it('座標係 0(城巴站資料攞唔到)嘅站唔計', () => {
    const stops = [{ stopId: 'zero', name: '彌敦道', lat: 0, lng: 0 }, at('ok', '佐敦道', 200)]
    expect(pickCounterpartStop(stops, hint)).toBe('ok')
  })

  it('hint 冇座標:同名得一個先用,多過一個唔估', () => {
    const noCoord = { name: '彌敦道', lat: 0, lng: 0 }
    expect(pickCounterpartStop([at('a', '彌敦道 (KT12)', 0), at('b', '佐敦道', 0)], noCoord)).toBe('a')
    expect(pickCounterpartStop([at('a', '彌敦道', 0), at('b', '彌敦道', 900)], noCoord)).toBeNull()
  })

  it('空清單 → null', () => {
    expect(pickCounterpartStop([], hint)).toBeNull()
  })
})

const r = (bound: 'I' | 'O', st: string, orig: string, dest: string, extra: Partial<Route> = {}): Route => ({
  co: 'kmb',
  route: '1A',
  bound,
  service_type: st,
  orig_tc: orig,
  dest_tc: dest,
  ...extra,
})

describe('pickReverseVariant', () => {
  const out = r('O', '1', '中秀茂坪', '尖沙咀碼頭')
  const back = r('I', '1', '尖沙咀碼頭', '中秀茂坪')
  const backSpecial = r('I', '2', '尖沙咀碼頭', '中秀茂坪')

  it('相反方向、同班次優先', () => {
    expect(pickReverseVariant(out, [out, backSpecial, back])).toBe(back)
  })

  it('冇同班次就用其他相反方向', () => {
    const special = r('O', '3', '中秀茂坪', '尖沙咀碼頭')
    expect(pickReverseVariant(special, [out, special, back])).toBe(back)
  })

  it('同班次之中揀終點返到起點嗰條', () => {
    const elsewhere = r('I', '1', '尖沙咀碼頭', '九龍城')
    expect(pickReverseVariant(out, [elsewhere, back])).toBe(back)
  })

  it('冇相反方向 / 循環線 → null', () => {
    expect(pickReverseVariant(out, [out])).toBeNull()
    const circ = r('O', '1', '竹園邨', '竹園邨 ')
    expect(pickReverseVariant(circ, [circ, r('I', '1', '竹園邨', '竹園邨')])).toBeNull()
  })

  it('GMB 同號跨區:只揀同 uid(同一條線另一個方向)', () => {
    const g = (bound: 'I' | 'O', uid: string, o: string, d: string) =>
      r(bound, '1', o, d, { co: 'gmb', route: '1', uid })
    const here = g('O', 'u1', '西貢', '坑口')
    const otherArea = g('I', 'u9', '荃灣', '葵涌')
    expect(pickReverseVariant(here, [here, otherArea])).toBeNull()
    const mine = g('I', 'u1', '坑口', '西貢')
    expect(pickReverseVariant(here, [otherArea, mine, here])).toBe(mine)
  })
})

describe('nearestBoardingStop', () => {
  const me = { lat: LAT, lng: LNG }

  it('揀最近嘅站,回傳站列位置同距離', () => {
    const stops = [at('a', '甲', 900), at('b', '乙', 120), at('c', '丙', -400), at('z', '總站', 2000)]
    const hit = nearestBoardingStop(stops, me)
    expect(hit?.stopId).toBe('b')
    expect(hit?.index).toBe(1)
    expect(hit?.distance).toBeGreaterThan(110)
    expect(hit?.distance).toBeLessThan(130)
  })

  it('最後一個站淨係落客,唔計(企喺總站都揀前一個)', () => {
    const stops = [at('a', '甲', 800), at('b', '乙', 300), at('end', '總站', 0)]
    expect(nearestBoardingStop(stops, me)?.stopId).toBe('b')
  })

  it('循環線:頭尾同一個站 → 揀頭站(開出嗰行)', () => {
    const stops = [at('loop', '總站', 0), at('m', '中途', 700), at('loop', '總站', 0)]
    expect(nearestBoardingStop(stops, me)?.index).toBe(0)
  })

  it('得一個站照揀;冇座標(城巴站資料攞唔到 = 0)跳過', () => {
    expect(nearestBoardingStop([at('only', '獨站', 50)], me)?.stopId).toBe('only')
    const stops = [
      { stopId: 'x', name: '冇座標', lat: 0, lng: 0 },
      at('y', '有座標', 600),
      at('end', '總站', 900),
    ]
    expect(nearestBoardingStop(stops, me)?.stopId).toBe('y')
  })

  it('冇站 / 位置無效 → null', () => {
    expect(nearestBoardingStop([], me)).toBeNull()
    expect(nearestBoardingStop([at('a', '甲', 10), at('b', '乙', 20)], { lat: NaN, lng: LNG })).toBeNull()
  })

  it('自動打開上限係 1 公里', () => {
    expect(AUTO_NEAREST_MAX_M).toBe(1000)
  })
})
