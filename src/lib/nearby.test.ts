import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchStopEta, type Eta, type Stop } from '../api/kmb'
import { fetchCtbEta } from '../api/ctb'
import { fetchGmbStopAll } from '../api/gmb'
import { getStopMap } from './store'
import { buildIndex, loadGraph, nearStops, type Indexed, type PlanRoute } from './planGraph'
import {
  ageRows,
  lastKnownLoc,
  nearbyBuses,
  NearbyError,
  nearbyErrorText,
  nearbyNotice,
  readNearbyCache,
  readNearbyTab,
  routeCompare,
  settledOrThrow,
  sortRows,
  writeNearbyCache,
  writeNearbyTab,
  type NearbyRow,
} from './nearby'

// 網絡 / 資料層全部 mock:測「全部失敗 → throw」「部分失敗照顯示」
vi.mock('../api/kmb', () => ({ fetchStopEta: vi.fn() }))
vi.mock('../api/ctb', () => ({ fetchCtbEta: vi.fn() }))
vi.mock('../api/gmb', () => ({ fetchGmbStopAll: vi.fn() }))
vi.mock('./store', () => ({ getStopMap: vi.fn() }))
vi.mock('./planGraph', async (orig) => ({
  ...(await orig<typeof import('./planGraph')>()),
  loadGraph: vi.fn(),
  nearStops: vi.fn(),
}))

afterEach(() => {
  localStorage.clear()
})

describe('routeCompare', () => {
  it('純數字細→大先,再到帶英文字母', () => {
    const input = ['269D', '1A', '11', '2', '1', 'N21', '269', 'X42', '2X']
    expect([...input].sort(routeCompare)).toEqual(['1', '2', '11', '269', '1A', '2X', 'N21', 'X42', '269D'])
  })
})

const row = (route: string, mins: number[], dist = 100): NearbyRow => ({
  co: 'kmb',
  route,
  dir: 'O',
  serviceType: '1',
  dest: '',
  stopId: 's',
  stopName: '',
  dist,
  mins,
})

describe('sortRows', () => {
  it('同號先比下一班,再比距離;mins 最多 3 班', () => {
    const out = sortRows([row('1', [9, 12, 15, 20], 50), row('1', [3], 300), row('1', [3], 200)])
    expect(out.map((r) => [r.mins[0], r.dist])).toEqual([
      [3, 200],
      [3, 300],
      [9, 50],
    ])
    expect(out[2].mins).toEqual([9, 12, 15])
  })
  it('冇班次(mins 空)排最後', () => {
    const out = sortRows([row('1', []), row('1', [5])])
    expect(out[0].mins).toEqual([5])
  })
})

// ---- 以下:斷網 / 舊結果 / storage 被封 ----
describe('ageRows', () => {
  it('唔夠一分鐘唔郁', () => {
    const rows = [row('1', [3, 8])]
    expect(ageRows(rows, 59_000)).toBe(rows)
  })
  it('減走過咗嘅分鐘,開走咗嘅班次同冇晒班次嘅路線唔要', () => {
    const out = ageRows([row('1', [1, 6]), row('2', [0, 2]), row('3', [4])], 3 * 60_000 + 5_000)
    expect(out.map((r) => [r.route, r.mins])).toEqual([
      ['1', [3]],
      ['3', [1]],
    ])
  })
})

describe('settledOrThrow', () => {
  it('部分失敗照返成功嗰啲', () => {
    expect(
      settledOrThrow<number>([
        { status: 'rejected', reason: new TypeError('Failed to fetch') },
        { status: 'fulfilled', value: 2 },
      ]),
    ).toEqual([2])
  })
  it('全部失敗 → 廣東話錯誤,唔係英文', () => {
    const run = () => settledOrThrow([{ status: 'rejected', reason: new TypeError('Failed to fetch') }])
    expect(run).toThrow(NearbyError)
    expect(run).toThrow(/^攞唔到到站時間/)
    expect(run).not.toThrow(/Failed/)
  })
  it('冇請求 = 冇嘢,唔當失敗', () => {
    expect(settledOrThrow([])).toEqual([])
  })
})

describe('nearbyErrorText', () => {
  it('自己嘅錯誤照出;其他轉 friendlyError', () => {
    expect(nearbyErrorText(new NearbyError('未能載入車站資料,請重試'))).toBe('未能載入車站資料,請重試')
    expect(nearbyErrorText(new TypeError('Failed to fetch'))).not.toMatch(/Failed/)
  })
  it('其他層自己寫嘅中文訊息(例如路線圖載入唔到)照出', () => {
    expect(nearbyErrorText(new Error('路線圖載入唔到,請檢查網絡再試'))).toBe('路線圖載入唔到,請檢查網絡再試')
  })
})

describe('nearbyNotice', () => {
  const base = { hasRows: true, stale: false, error: null, oldLoc: false }
  it('冇列表唔出(交俾大公仔)', () => {
    expect(nearbyNotice({ ...base, hasRows: false, error: 'x' })).toBeNull()
    expect(nearbyNotice({ ...base, hasRows: false, error: 'x', oldLoc: true })).toBeNull()
  })
  it('用緊上次位置但附近冇車:都要講明係上次位置 + 可以重試', () => {
    expect(nearbyNotice({ ...base, hasRows: false, oldLoc: true })).toEqual({
      text: '📍 定位唔到,顯示緊上次位置附近嘅車',
      retry: true,
    })
  })
  it('刷新失敗:講原因 + 上次結果 + 重試', () => {
    expect(nearbyNotice({ ...base, stale: true, error: '冇網絡連線' })).toEqual({
      text: '⚠️ 冇網絡連線(顯示緊上次結果)',
      retry: true,
    })
  })
  it('定位唔到用緊上次位置:要講 + 可以重試', () => {
    expect(nearbyNotice({ ...base, oldLoc: true })?.retry).toBe(true)
  })
  it('cache 即顯更新緊:唔使重試掣', () => {
    expect(nearbyNotice({ ...base, stale: true })).toEqual({
      text: '⏳ 顯示緊上次結果,更新緊…',
      retry: false,
    })
  })
  it('即時結果冇提示', () => {
    expect(nearbyNotice(base)).toBeNull()
  })
})

describe('nearby cache / tab', () => {
  it('空結果唔會蓋咗上次好嘅 cache', () => {
    writeNearbyCache('kmb', 22.3, 114.1, [row('1', [3])])
    writeNearbyCache('kmb', 22.4, 114.2, [])
    expect(readNearbyCache('kmb')?.lat).toBe(22.3)
  })
  it('lastKnownLoc 攞最新嗰個營辦商嘅位置', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    writeNearbyCache('ctb', 1, 2, [row('1', [3])])
    vi.spyOn(Date, 'now').mockReturnValue(1_060_000)
    writeNearbyCache('gmb', 3, 4, [row('1', [3])])
    expect(lastKnownLoc()).toEqual({ lat: 3, lng: 4 })
  })
  it('storage 被封(SecurityError)都唔炒車', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(readNearbyTab()).toBe('kmb')
    expect(() => writeNearbyTab('gmb')).not.toThrow()
    expect(() => writeNearbyCache('kmb', 1, 2, [row('1', [3])])).not.toThrow()
    expect(readNearbyCache('kmb')).toBeNull()
  })
  it('記得上次揀嘅 tab', () => {
    writeNearbyTab('fit')
    expect(readNearbyTab()).toBe('fit')
  })
})

// ---- nearbyBuses:全部請求失敗要 throw,唔好扮「附近冇車」----
const stop = (id: string, lat: number): Stop => ({
  stop: id,
  name_en: '',
  name_tc: `站${id}`,
  name_sc: '',
  lat: String(lat),
  long: '114.17',
})
const kmbEta = (route: string, inMin: number): Eta =>
  ({
    co: 'KMB',
    route,
    dir: 'O',
    service_type: 1,
    dest_tc: '尖沙咀',
    eta: new Date(Date.now() + inMin * 60_000).toISOString(),
  }) as Eta

describe('nearbyBuses', () => {
  it('KMB 全部站都攞唔到 → NearbyError', async () => {
    vi.mocked(getStopMap).mockResolvedValue(new Map([['A', stop('A', 22.31)]]))
    vi.mocked(fetchStopEta).mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(nearbyBuses(22.31, 114.17, 'kmb')).rejects.toBeInstanceOf(NearbyError)
  })
  it('KMB 部分站失敗照顯示其他站', async () => {
    vi.mocked(getStopMap).mockResolvedValue(
      new Map([
        ['A', stop('A', 22.32)],
        ['B', stop('B', 22.3201)],
      ]),
    )
    vi.mocked(fetchStopEta).mockImplementation(async (id) => {
      if (id === 'A') throw new TypeError('Failed to fetch')
      return [kmbEta('1A', 5)]
    })
    const rows = await nearbyBuses(22.32, 114.17, 'kmb')
    expect(rows.map((r) => [r.route, r.stopId])).toEqual([['1A', 'B']])
  })
  it('CTB 第一批全部失敗 → 唔再撞落去,throw', async () => {
    const routes = Array.from({ length: 20 }, (_, i) => ({ co: 'ctb', r: String(i + 1), b: 'O', d: '中環' }))
    const ix = {
      graph: { stops: { S1: [0, 0, '站一'] } },
      routeByIdx: routes,
      stopRoutes: new Map([['S1', routes.map((_, ri) => ({ ri, seq: 1 }))]]),
      grid: new Map(),
    } as unknown as Indexed
    vi.mocked(loadGraph).mockResolvedValue(ix)
    vi.mocked(nearStops).mockReturnValue([{ id: 'S1', dist: 80 }] as ReturnType<typeof nearStops>)
    vi.mocked(fetchCtbEta).mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(nearbyBuses(22.33, 114.17, 'ctb')).rejects.toBeInstanceOf(NearbyError)
    expect(vi.mocked(fetchCtbEta)).toHaveBeenCalledTimes(8)
  })
  it('CTB 循環線(OI)喺回程半程嘅站 → 用 I 查,唔會重複查', async () => {
    const pr = (b: PlanRoute['b'], st: string[]): PlanRoute => ({
      k: `ctb|1M|${b}|1`,
      co: 'ctb',
      r: '1M',
      b,
      s: '1',
      o: '中環',
      d: '中環',
      jt: null,
      st,
    })
    const ix = buildIndex({
      routes: [pr('O', ['A', 'B']), pr('I', ['C', 'D']), pr('OI', ['A', 'B', 'C', 'D'])],
      stops: { A: [22.3, 114.1, 'A'], B: [22.3, 114.1, 'B'], C: [22.3, 114.1, '站C'], D: [22.3, 114.1, 'D'] },
    })
    vi.mocked(loadGraph).mockResolvedValue(ix)
    vi.mocked(nearStops).mockReturnValue([{ id: 'C', dist: 30 }])
    vi.mocked(fetchCtbEta).mockResolvedValue([])
    await nearbyBuses(22.37, 114.17, 'ctb')
    expect(vi.mocked(fetchCtbEta).mock.calls).toEqual([['C', '1M', 'I']])
  })
  it('GMB 全部站失敗 → throw', async () => {
    const ix = {
      graph: { stops: { G1: [0, 0, '小巴站'] } },
      routeByIdx: [{ co: 'gmb', r: '11', b: 'O', d: '旺角' }],
      stopRoutes: new Map([['G1', [{ ri: 0, seq: 1 }]]]),
      grid: new Map(),
    } as unknown as Indexed
    vi.mocked(loadGraph).mockResolvedValue(ix)
    vi.mocked(nearStops).mockReturnValue([{ id: 'G1', dist: 50 }] as ReturnType<typeof nearStops>)
    vi.mocked(fetchGmbStopAll).mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(nearbyBuses(22.34, 114.17, 'gmb')).rejects.toBeInstanceOf(NearbyError)
  })
  it('API 層吞咗錯誤變空結果,但部機明明離線 → 都當失敗', async () => {
    const ix = {
      graph: { stops: { G1: [0, 0, '小巴站'] } },
      routeByIdx: [{ co: 'gmb', r: '11', b: 'O', d: '旺角' }],
      stopRoutes: new Map([['G1', [{ ri: 0, seq: 1 }]]]),
      grid: new Map(),
    } as unknown as Indexed
    vi.mocked(loadGraph).mockResolvedValue(ix)
    vi.mocked(nearStops).mockReturnValue([{ id: 'G1', dist: 50 }] as ReturnType<typeof nearStops>)
    vi.mocked(fetchGmbStopAll).mockResolvedValue([])
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await expect(nearbyBuses(22.35, 114.17, 'gmb')).rejects.toThrow('冇網絡連線')
  })
  it('真係冇車(有網)就返空列表', async () => {
    vi.mocked(getStopMap).mockResolvedValue(new Map([['C', stop('C', 22.36)]]))
    vi.mocked(fetchStopEta).mockResolvedValue([])
    await expect(nearbyBuses(22.36, 114.17, 'kmb')).resolves.toEqual([])
  })
})
