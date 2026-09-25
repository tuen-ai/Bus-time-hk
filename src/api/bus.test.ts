import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  coClass,
  coLabel,
  getEta,
  getRouteStops,
  indexRoutes,
  pickRoute,
  pickRouteAtStop,
  routeKey,
  routeKeyOf,
  routeVariants,
  sameRoute,
  type Route,
} from './bus'
import type { LrTrain } from './lrt'

// 網絡 / 大檔一律 mock;輕鐵、嶼巴靜態資料用真嘅(細檔,順便驗吓 bake 出嚟嘅資料)
const m = vi.hoisted(() => ({
  fetchRoutes: vi.fn(),
  fetchEta: vi.fn(),
  fetchCtbRoutes: vi.fn(),
  fetchLrtSchedule: vi.fn(),
  fetchNlbEta: vi.fn(),
  fetchGmbEta: vi.fn(),
  gmbRoutesAsync: vi.fn(),
  gmbRouteStops: vi.fn(),
  cacheGet: vi.fn(),
  cachePut: vi.fn(),
}))
vi.mock('./kmb', () => ({ fetchRoutes: m.fetchRoutes, fetchEta: m.fetchEta }))
vi.mock('./ctb', () => ({ fetchCtbRoutes: m.fetchCtbRoutes }))
vi.mock('./lrt', () => ({ fetchLrtSchedule: m.fetchLrtSchedule }))
vi.mock('./nlb', () => ({ fetchNlbEta: m.fetchNlbEta }))
vi.mock('./gmb', () => ({ fetchGmbEta: m.fetchGmbEta }))
vi.mock('../lib/gmbData', () => ({ gmbRoutesAsync: m.gmbRoutesAsync, gmbRouteStops: m.gmbRouteStops }))
vi.mock('../lib/store', () => ({ getStopMap: vi.fn() }))
vi.mock('../lib/kv', () => ({ cacheGet: m.cacheGet, cachePut: m.cachePut }))

const R = (p: Partial<Route> & Pick<Route, 'co' | 'route'>): Route => ({
  bound: 'O',
  service_type: '1',
  orig_tc: '',
  dest_tc: '',
  ...p,
})

describe('bus helpers', () => {
  it('coLabel / coClass', () => {
    expect(coLabel('kmb')).toBe('九巴')
    expect(coLabel('gmb')).toBe('綠van')
    expect(coClass('kmb')).toBe('') // 九巴用預設粉紅
    expect(coClass('ctb')).toBe('co-ctb')
  })

  it('routeKey 同 routeKeyOf 一致(收藏 / 推薦 / 規劃 leg 對返 Route)', () => {
    const r: Route = { co: 'ctb', route: '1', bound: 'I', service_type: '1', orig_tc: 'a', dest_tc: 'b' }
    expect(routeKeyOf(r)).toBe('ctb|1|I|1')
    expect(routeKey({ co: 'ctb', route: '1', bound: 'I', serviceType: '1' })).toBe(routeKeyOf(r))
  })
})

describe('getEta:九巴只要本方向', () => {
  it('總站 / 共用站同時回兩個方向 → 剔走對面線', async () => {
    const e = (dir: 'I' | 'O', seq: number, eta: string) =>
      ({
        co: 'KMB',
        route: '1A',
        dir,
        service_type: 1,
        seq: 1,
        dest_tc: '',
        eta_seq: seq,
        eta,
        rmk_tc: '',
      }) as never
    m.fetchEta.mockResolvedValue([e('O', 1, 'o1'), e('I', 1, 'i1'), e('O', 2, 'o2'), e('I', 2, 'i2')])
    const out = await getEta(R({ co: 'kmb', route: '1A', bound: 'O' }), 'S1')
    expect(out.map((x) => x.eta)).toEqual(['o1', 'o2'])
    expect(out.every((x) => x.co === 'kmb' && x.dir === 'O')).toBe(true)
    const back = await getEta(R({ co: 'kmb', route: '1A', bound: 'I' }), 'S1')
    expect(back.map((x) => x.eta)).toEqual(['i1', 'i2'])
  })
})

describe('getEta:輕鐵', () => {
  const NOW = Date.UTC(2026, 8, 25, 2, 0, 0)
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  const t = (route: string, destTc: string, mins: number, platform: string): LrTrain => ({
    route,
    destTc,
    mins,
    platform,
  })
  const mins = (es: { eta: string | null }[]) => es.map((e) => (new Date(e.eta!).getTime() - NOW) / 60_000)
  const lr = (route: string, bound: 'I' | 'O', dest: string) => R({ co: 'lrt', route, bound, dest_tc: dest })

  // 月台 1 往三聖、月台 2 往兆康;月台 2 仲有一班 751 往友愛
  const station = [
    t('505', '三聖', 8, '1'),
    t('505', '三聖', 15, '1'),
    t('505', '兆康', 2, '2'),
    t('751', '友愛', 3, '2'),
  ]

  it('只要本方向(按終點站),唔撈對面月台', async () => {
    m.fetchLrtSchedule.mockResolvedValue(station)
    const out = await getEta(lr('505', 'O', '兆康'), 'LR100')
    expect(m.fetchLrtSchedule).toHaveBeenCalledWith(100)
    expect(mins(out)).toEqual([2])
    expect(out[0]).toMatchObject({
      co: 'lrt',
      route: '505',
      dir: 'O',
      dest_tc: '兆康',
      rmk_tc: '月台 2',
      eta_seq: 1,
    })
    expect(mins(await getEta(lr('505', 'I', '三聖'), 'LR100'))).toEqual([8, 15])
  })

  it('跨月台按分鐘排,eta_seq 跟返時間次序', async () => {
    m.fetchLrtSchedule.mockResolvedValue([t('505', '三聖', 15, '1'), t('505', '三聖', 4, '2')])
    const out = await getEta(lr('505', 'I', '三聖'), 'LR920')
    expect(mins(out)).toEqual([4, 15])
    expect(out.map((e) => e.eta_seq)).toEqual([1, 2])
    expect(out.map((e) => e.rmk_tc)).toEqual(['月台 2', '月台 1'])
  })

  it("'*' 特別班:API route_no 冇 '*' 都對到;冇特別班就回空,唔借正常班次", async () => {
    m.fetchLrtSchedule.mockResolvedValue(station)
    expect(await getEta(lr('751*', 'O', '屯門碼頭'), 'LR480')).toEqual([])
    m.fetchLrtSchedule.mockResolvedValue([...station, t('751', '屯門碼頭', 6, '1')])
    const out = await getEta(lr('751*', 'O', '屯門碼頭'), 'LR480')
    expect(mins(out)).toEqual([6])
    expect(out[0].route).toBe('751*')
  })

  it('終點有括號註解(循環線)都對到', async () => {
    m.fetchLrtSchedule.mockResolvedValue([t('610P', '兆康', 7, '1'), t('610', '元朗', 1, '1')])
    expect(mins(await getEta(lr('610P*', 'O', '兆康 (循環線)'), 'LR100'))).toEqual([7])
  })

  it('認得終點但係去另一邊 = 呢個方向暫時冇車(唔好顯示對面線)', async () => {
    m.fetchLrtSchedule.mockResolvedValue(station)
    expect(await getEta(lr('751', 'O', '天逸'), 'LR275')).toEqual([])
  })

  it('API 終點寫法完全認唔到 → 退返舊做法,全部本路綫都顯示', async () => {
    m.fetchLrtSchedule.mockResolvedValue([t('505', 'Siu Hong', 9, '1'), t('505', 'Sam Shing', 3, '2')])
    expect(mins(await getEta(lr('505', 'O', '兆康'), 'LR100'))).toEqual([3, 9])
  })

  it('唔知方向(舊收藏冇目的地)→ 本路綫全部顯示,但係按分鐘排', async () => {
    m.fetchLrtSchedule.mockResolvedValue(station)
    expect(mins(await getEta(lr('505', 'O', ''), 'LR100'))).toEqual([2, 8, 15])
  })
})

describe('getEta / getRouteStops:嶼巴同號變體', () => {
  it('冇 uid(收藏)→ 用目的地 + 經過嘅站揀返啱嘅 nlbId', async () => {
    m.fetchNlbEta.mockResolvedValue([])
    const fav = R({ co: 'nlb', route: '3M', bound: 'O', dest_tc: '梅窩碼頭' })
    await getEta(fav, '278')
    expect(m.fetchNlbEta).toHaveBeenLastCalledWith('6', '278')
    // 同樣往東涌:梅窩碼頭開(id 7)經過站 1,貝澳開(id 8)唔經
    await getEta({ ...fav, dest_tc: '東涌站巴士總站' }, '1')
    expect(m.fetchNlbEta).toHaveBeenLastCalledWith('7', '1')
  })

  it('有 uid → 站序跟返嗰條變體', async () => {
    const { nlbRoutes } = await import('../lib/nlbData')
    const v = nlbRoutes().filter((r) => r.route === '3M' && r.bound === 'O' && r.service_type === '1')
    expect(v.length).toBeGreaterThan(1)
    const firstStops = await Promise.all(v.map(async (r) => (await getRouteStops(r))[0]?.stopId))
    expect(new Set(firstStops).size).toBe(v.length) // 以前全部都係最後嗰條嘅站
  })
})

describe('getEta / getRouteStops:GMB 帶 uid', () => {
  it('uid + 方向傳落 gmbRouteStops;uid 當 routeId 傳落 fetchGmbEta', async () => {
    m.gmbRouteStops.mockResolvedValue([])
    m.fetchGmbEta.mockResolvedValue([])
    const r = R({ co: 'gmb', route: '1', bound: 'I', service_type: '1', uid: '2006408' })
    await getRouteStops(r)
    expect(m.gmbRouteStops).toHaveBeenCalledWith('2006408', 'I')
    await getEta(r, '20001234')
    expect(m.fetchGmbEta).toHaveBeenCalledWith('20001234', '1', 'I', '2006408')
  })
})

describe('pickRoute / pickRouteAtStop / routeVariants', () => {
  // 綠van 1:山頂↔中環(A)、西貢↔九龍灣(B)同號;C 係 B 嘅特別班(uid 唔同但共用總站)
  const A_O = R({ co: 'gmb', route: '1', uid: 'A', orig_tc: '山頂', dest_tc: '中環(香港站)' })
  const A_I = R({ co: 'gmb', route: '1', uid: 'A', bound: 'I', orig_tc: '中環(香港站)', dest_tc: '山頂' })
  const B_O = R({ co: 'gmb', route: '1', uid: 'B', orig_tc: '西貢', dest_tc: '九龍灣(德福花園)' })
  const B_I = R({ co: 'gmb', route: '1', uid: 'B', bound: 'I', orig_tc: '九龍灣(德福花園)', dest_tc: '西貢' })
  const C_O = R({ co: 'gmb', route: '1', uid: 'C', service_type: '2', orig_tc: '西貢', dest_tc: '九龍灣' })
  const all = [A_O, A_I, B_O, B_I, C_O]
  const idx = indexRoutes(all)
  const key = { co: 'gmb' as const, route: '1', bound: 'O' as const, serviceType: '1' }

  it('uid 優先;冇 uid 用目的地;都冇就第一條', () => {
    expect(pickRoute(idx, { ...key, uid: 'B' })).toBe(B_O)
    expect(pickRoute(idx, { ...key, dest: '九龍灣(德福花園)' })).toBe(B_O)
    expect(pickRoute(idx, { ...key, dest: '九龍灣' })).toBe(B_O) // 寬鬆 includes
    expect(pickRoute(idx, key)).toBe(A_O)
    expect(pickRoute(idx, { ...key, route: '2' })).toBeUndefined()
  })

  it('uid 喺同 key 冇 → 搵同號同方向其他班次(附近 tab 綠van serviceType 一律當 1)', async () => {
    expect(pickRoute(idx, { ...key, uid: 'C' })).toBe(C_O)
    expect(await pickRouteAtStop(idx, { ...key, uid: 'C', stopId: 'x' })).toBe(C_O)
    // 方向唔啱唔好亂開:C 冇回程 → 退返同 key 嘅目的地 tiebreak
    expect(pickRoute(idx, { ...key, bound: 'I', uid: 'C', dest: '西貢' })).toBe(B_I)
    // 其他號碼同 uid 都唔會撈錯
    expect(pickRoute(idx, { ...key, route: '2', uid: 'C' })).toBeUndefined()
  })

  it('嶼巴舊收藏:同方向搵唔到就試相反方向', () => {
    const nlbI = R({ co: 'nlb', route: '3M', bound: 'I', service_type: '2', dest_tc: '梅窩碼頭' })
    expect(pickRoute(indexRoutes([nlbI]), { co: 'nlb', route: '3M', bound: 'O', serviceType: '2' })).toBe(
      nlbI,
    )
  })

  it('pickRouteAtStop:同號同目的地又冇 uid → 睇邊條經過個站', async () => {
    const X = R({ co: 'gmb', route: '101M', uid: 'X', service_type: '2', dest_tc: '坑口' })
    const Y = R({ co: 'gmb', route: '101M', uid: 'Y', service_type: '2', dest_tc: '坑口' })
    m.gmbRouteStops.mockImplementation(async (uid: string) => [
      { seq: 1, stopId: uid === 'Y' ? 'S-Y' : 'S-X', name: '', lat: 0, lng: 0 },
    ])
    const q = { co: 'gmb' as const, route: '101M', bound: 'O' as const, serviceType: '2', dest: '坑口' }
    const i2 = indexRoutes([X, Y])
    expect(await pickRouteAtStop(i2, { ...q, stopId: 'S-Y' })).toBe(Y)
    expect(await pickRouteAtStop(i2, { ...q, stopId: 'S-X' })).toBe(X)
    expect(await pickRouteAtStop(i2, { ...q, stopId: 'nowhere' })).toBe(X)
    expect(await pickRouteAtStop(i2, { ...q, uid: 'Y' })).toBe(Y)
  })

  it('routeVariants:GMB 只列同區(同 uid 或共用總站)', () => {
    expect(routeVariants(all, A_O)).toEqual([A_O, A_I])
    expect(routeVariants(all, B_O)).toEqual([B_O, B_I, C_O])
    const kmb = [R({ co: 'kmb', route: '1' }), R({ co: 'kmb', route: '1', bound: 'I' })]
    expect(routeVariants([...kmb, ...all], kmb[0])).toEqual(kmb)
  })

  it('sameRoute 要 key + uid 都一樣', () => {
    expect(sameRoute(A_O, { ...A_O })).toBe(true)
    expect(sameRoute(A_O, B_O)).toBe(false)
    expect(sameRoute(A_O, A_I)).toBe(false)
  })
})

describe('getAllRoutes:殘缺清單唔可以蓋過齊料嗰份', () => {
  const DAY = 24 * 60 * 60 * 1000
  const kmbRaw = [{ route: '1A', bound: 'O', service_type: '1', orig_tc: '中秀茂坪', dest_tc: '尖沙咀碼頭' }]
  const ctbRoute = R({ co: 'ctb', route: '1', dest_tc: '跑馬地' })
  const oldKmb = R({ co: 'kmb', route: '1A', dest_tc: '舊尖沙咀' })
  const oldCtb = R({ co: 'ctb', route: '1', dest_tc: '舊跑馬地' })
  // 舊快取嘅嶼巴行冇 uid
  const oldNlb = R({ co: 'nlb', route: '3M', dest_tc: '東涌站巴士總站' })
  const oldList = [oldKmb, oldCtb, oldNlb]

  const load = async () => {
    vi.resetModules()
    return import('./bus')
  }
  const flush = () => new Promise((r) => setTimeout(r, 0))

  beforeEach(() => {
    m.fetchRoutes.mockResolvedValue(kmbRaw)
    m.fetchCtbRoutes.mockResolvedValue([ctbRoute])
    m.gmbRoutesAsync.mockResolvedValue([R({ co: 'gmb', route: '1', uid: 'A' })])
    m.cacheGet.mockResolvedValue(null)
    m.cachePut.mockResolvedValue(undefined)
  })

  it('背景刷新九巴失敗 → 保留快取、唔 onRefresh、唔寫快取', async () => {
    const bus = await load()
    m.cacheGet.mockResolvedValue({ data: oldList, age: 2 * DAY })
    m.fetchRoutes.mockRejectedValue(new Error('timeout'))
    const onRefresh = vi.fn()
    const first = await bus.getAllRoutes(onRefresh)
    expect(first.some((r) => r.co === 'kmb')).toBe(true)
    await flush()
    expect(m.fetchRoutes).toHaveBeenCalled()
    expect(onRefresh).not.toHaveBeenCalled()
    expect(m.cachePut).not.toHaveBeenCalled()
    expect(bus.missingOperators()).toEqual([])
    expect(await bus.getAllRoutes()).toBe(first) // 之後都仲係齊料嗰份
  })

  it('快取入面嘅嶼巴 / 輕鐵換成今個版本(有 uid)', async () => {
    const bus = await load()
    m.cacheGet.mockResolvedValue({ data: oldList, age: 1000 })
    const rs = await bus.getAllRoutes()
    const nlb = rs.filter((r) => r.co === 'nlb')
    expect(nlb.length).toBeGreaterThan(1)
    expect(nlb.every((r) => !!r.uid)).toBe(true)
    expect(rs.some((r) => r.co === 'lrt')).toBe(true)
    expect(rs[0]).toBe(oldKmb) // 九巴排頭,次序唔變
    expect(m.fetchRoutes).not.toHaveBeenCalled() // 1 日內唔使背景刷新
  })

  it('背景刷新齊料 → onRefresh + 寫快取', async () => {
    const bus = await load()
    m.cacheGet.mockResolvedValue({ data: oldList, age: 2 * DAY })
    const onRefresh = vi.fn()
    await bus.getAllRoutes(onRefresh)
    await flush()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    const fresh = onRefresh.mock.calls[0][0] as Route[]
    expect(fresh.find((r) => r.co === 'kmb')?.dest_tc).toBe('尖沙咀碼頭')
    expect(m.cachePut).toHaveBeenCalledWith('bus.routes', fresh)
    expect(await bus.getAllRoutes()).toBe(fresh)
  })

  it('冇快取、九巴失敗 → 回殘缺清單 + missing;重試會再 fetch', async () => {
    const bus = await load()
    m.fetchRoutes.mockRejectedValueOnce(new Error('503'))
    const partial = await bus.getAllRoutes()
    expect(partial.some((r) => r.co === 'kmb')).toBe(false)
    expect(bus.missingOperators()).toEqual(['kmb'])
    expect(m.cachePut).not.toHaveBeenCalled()
    const retry = await bus.getAllRoutes()
    expect(retry.some((r) => r.co === 'kmb')).toBe(true)
    expect(bus.missingOperators()).toEqual([])
    expect(m.cachePut).toHaveBeenCalledTimes(1)
  })

  it('快取過咗 7 日、九巴失敗 → 九巴用舊快取補返(唔寫快取),但照記低九巴攞唔到', async () => {
    const bus = await load()
    m.cacheGet.mockResolvedValue({ data: oldList, age: 9 * DAY })
    m.fetchRoutes.mockRejectedValue(new Error('timeout'))
    const rs = await bus.getAllRoutes()
    expect(rs.filter((r) => r.co === 'kmb')).toEqual([oldKmb])
    expect(rs.filter((r) => r.co === 'ctb')).toEqual([ctbRoute]) // 攞到嘅用新嘅
    expect(bus.missingOperators()).toEqual(['kmb']) // 搵唔到新路線時講得出原因
    expect(m.cachePut).not.toHaveBeenCalled()
  })

  it('上次唔齊料、今次讀到齊料快取 → missing 清返', async () => {
    const bus = await load()
    m.fetchRoutes.mockRejectedValueOnce(new Error('503'))
    await bus.getAllRoutes()
    expect(bus.missingOperators()).toEqual(['kmb'])
    // 例如另一個分頁啱啱寫咗齊料快取
    m.cacheGet.mockResolvedValue({ data: oldList, age: 1000 })
    const rs = await bus.getAllRoutes()
    expect(rs.some((r) => r.co === 'kmb')).toBe(true)
    expect(bus.missingOperators()).toEqual([])
  })
})
