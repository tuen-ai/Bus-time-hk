import { describe, expect, it } from 'vitest'
import {
  buildIndex,
  inflateGraph,
  nearStops,
  stopName,
  toAppKey,
  type PackedGraph,
  type PlanGraph,
  type PlanRoute,
} from './planGraph'
import committed from '../data/planGraph.json'
import { distanceMeters } from './geo'

// 細圖:三個站排成一直線(每格約 111m),一條線經晒
const graph: PlanGraph = {
  routes: [
    { k: 'kmb|1|O|1', co: 'kmb', r: '1', b: 'O', s: '1', o: 'A', d: 'C', jt: 10, st: ['A', 'B', 'C'] },
  ],
  stops: {
    A: [22.3, 114.17, '站A'],
    B: [22.301, 114.17, '站B'],
    C: [22.302, 114.17, '站C'],
    FAR: [22.5, 114.4, '好遠'],
  },
}

describe('planGraph index', () => {
  const ix = buildIndex(graph)

  it('stopRoutes:每個站知道邊條線經 + 站序', () => {
    expect(ix.stopRoutes.get('B')).toEqual([{ ri: 0, seq: 1 }])
    expect(ix.stopRoutes.get('FAR')).toBeUndefined()
  })

  it('nearStops:半徑內由近到遠,封頂 limit', () => {
    const near = nearStops(ix, 22.3, 114.17, 500, 10)
    expect(near.map((n) => n.id)).toEqual(['A', 'B', 'C'])
    expect(near[0].dist).toBeCloseTo(0, 0)
    expect(near[1].dist).toBeGreaterThan(100)
    expect(nearStops(ix, 22.3, 114.17, 150, 10).map((n) => n.id)).toEqual(['A', 'B'])
    expect(nearStops(ix, 22.3, 114.17, 500, 1).map((n) => n.id)).toEqual(['A'])
  })

  it('stopName:冇資料就回 id', () => {
    expect(stopName(graph, 'A')).toBe('站A')
    expect(stopName(graph, 'nope')).toBe('nope')
  })
})

describe('inflateGraph(v2 壓縮格式)', () => {
  const packed: PackedGraph = {
    v: 2,
    ids: ['A', 'B', 'C', 'FAR'],
    ll: [
      [22.3, 114.17],
      [22.301, 114.17],
      [22.302, 114.17],
      [22.5, 114.4],
    ],
    n: ['站A', '站B', '站C', '好遠'],
    routes: [['kmb', '1', 'O', '1', 'A', 'C', 10, [0, 1, 2]]],
  }

  it('解返同原本 PlanGraph 一模一樣(k 由 co|r|b|s 砌返)', () => {
    expect(inflateGraph(packed)).toEqual(graph)
  })

  it('舊格式照原樣用', () => {
    expect(inflateGraph(graph)).toBe(graph)
  })

  it('站 index 超出範圍 → 拋錯(唔好靜靜變 undefined 站)', () => {
    const bad: PackedGraph = { ...packed, routes: [['kmb', '1', 'O', '1', 'A', 'C', 10, [0, 9]]] }
    expect(() => inflateGraph(bad)).toThrow()
  })
})

// 城巴循環線:去程 A→B→C,回程 C→D→A,循環 OI = A B C D A(C 係轉頭站)
const loop = (over: Partial<PlanRoute>): PlanRoute => ({
  k: '',
  co: 'ctb',
  r: '9',
  b: 'O',
  s: '1',
  o: '',
  d: '',
  jt: null,
  st: [],
  ...over,
})
const loopGraph: PlanGraph = {
  routes: [
    loop({ b: 'O', st: ['A', 'B', 'C'] }),
    loop({ b: 'I', st: ['C', 'D', 'A'] }),
    loop({ b: 'OI', st: ['A', 'B', 'C', 'D', 'A'] }),
    loop({ b: 'O', s: '2', st: ['A', 'B', 'C'] }),
    loop({ co: 'lightRail', r: '505', b: 'I', s: '1', st: ['A', 'B'] }),
    loop({ co: 'kmb', r: '1', b: 'O', s: '2', st: ['A', 'B'] }),
    // 兩邊都有嘅站(X→Y 兩個方向都行):靠位置判斷
    loop({ r: '8', b: 'O', st: ['X', 'Y', 'P'] }),
    loop({ r: '8', b: 'I', st: ['P', 'X', 'Y', 'Q'] }),
    loop({ r: '8', b: 'OI', st: ['X', 'Y', 'P', 'X', 'Y', 'Q'] }),
    // 正線去程唔經 S、回程經(S→T);去程特別班由 S 開(S→U)→ 循環線 S→U 係去程
    loop({ r: '7', b: 'O', s: '1', st: ['W', 'U', 'V'] }),
    loop({ r: '7', b: 'O', s: '2', st: ['S', 'U', 'V'] }),
    loop({ r: '7', b: 'I', s: '1', st: ['V', 'S', 'T', 'W'] }),
    loop({ r: '7', b: 'OI', st: ['S', 'U', 'V', 'S', 'T', 'W'] }),
  ],
  stops: {},
}

describe('toAppKey:planGraph 路線 → app 路線 key', () => {
  const ix = buildIndex(loopGraph)

  it('循環線:睇上車站→下一站喺去程定回程', () => {
    expect(toAppKey(ix, 2, 0).bound).toBe('O') // A→B
    expect(toAppKey(ix, 2, 1).bound).toBe('O') // B→C
    expect(toAppKey(ix, 2, 2).bound).toBe('I') // C→D(轉頭站上車 = 回程)
    expect(toAppKey(ix, 2, 3).bound).toBe('I') // D→A
  })

  it('循環線:同一段兩邊都有 → 按位置(去程總站之前 = 前半)', () => {
    expect(toAppKey(ix, 8, 0).bound).toBe('O')
    expect(toAppKey(ix, 8, 3).bound).toBe('I')
    expect(toAppKey(ix, 8, 4).bound).toBe('I')
  })

  it('循環線:特別班次都計(唔好淨係睇正線)', () => {
    expect(toAppKey(ix, 12, 0).bound).toBe('O') // S→U:去程特別班有
    expect(toAppKey(ix, 12, 3).bound).toBe('I') // S→T:回程
  })

  it('輕鐵 lightRail → lrt;城巴特別班次當正線;九巴班次照留', () => {
    expect(toAppKey(ix, 4, 0)).toEqual({ co: 'lrt', route: '505', bound: 'I', serviceType: '1' })
    expect(toAppKey(ix, 3, 0)).toEqual({ co: 'ctb', route: '9', bound: 'O', serviceType: '1' })
    expect(toAppKey(ix, 5, 0)).toEqual({ co: 'kmb', route: '1', bound: 'O', serviceType: '2' })
  })
})

// `as unknown as` cast 令 TS 睇唔到 JSON 真係咩形狀 → 直接驗 committed 檔
describe('committed planGraph.json', () => {
  const g = inflateGraph(committed as unknown as PackedGraph)
  const ix = buildIndex(g)
  const COS = new Set(['kmb', 'ctb', 'nlb', 'gmb', 'lightRail'])
  const BOUNDS = new Set(['I', 'O', 'OI', 'IO'])

  it('nearStops 同逐個站暴力計結果一樣,但淨係睇附近幾格(唔係掃成個香港)', () => {
    const ids = Object.keys(g.stops)
    // 固定種子:一半隨機點、一半真站位(保證有結果)
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const pts: [number, number][] = []
    for (let i = 0; i < 30; i++) pts.push([22.2 + rnd() * 0.3, 113.9 + rnd() * 0.45])
    for (let i = 0; i < 30; i++) {
      const [lat, lng] = g.stops[ids[Math.floor(rnd() * ids.length)]]
      pts.push([lat + (rnd() - 0.5) * 0.004, lng + (rnd() - 0.5) * 0.004])
    }
    const byDist = (a: { id: string; dist: number }, b: { id: string; dist: number }) =>
      a.dist - b.dist || a.id.localeCompare(b.id)
    let lookups = 0
    const grid = new Map(ix.grid)
    const get = grid.get.bind(grid)
    grid.get = (k: string) => {
      lookups++
      return get(k)
    }
    const counted = { ...ix, grid }
    let found = 0
    for (const radius of [300, 500, 600, 800, 1500]) {
      for (const [lat, lng] of pts) {
        lookups = 0
        const got = nearStops(counted, lat, lng, radius, 100_000).sort(byDist)
        // 500m 以前要掃 5 萬幾格;而家 ±幾格
        if (radius <= 800) expect(lookups).toBeLessThanOrEqual(49)
        const want = ids
          .map((id) => ({ id, dist: distanceMeters(lat, lng, g.stops[id][0], g.stops[id][1]) }))
          .filter((x) => x.dist <= radius)
          .sort(byDist)
        expect(got).toEqual(want)
        found += got.length
      }
    }
    expect(found).toBeGreaterThan(100)
  })

  it('每條線 co / bound / 站都對得上型別', () => {
    expect(g.routes.length).toBeGreaterThan(1000)
    for (const r of g.routes) {
      expect(COS.has(r.co), r.k).toBe(true)
      expect(BOUNDS.has(r.b), r.k).toBe(true)
      expect(r.k).toBe(`${r.co}|${r.r}|${r.b}|${r.s}`)
      expect(r.jt === null || typeof r.jt === 'number', r.k).toBe(true)
      expect(
        r.st.every((id) => id in g.stops),
        r.k,
      ).toBe(true)
    }
  })

  it('循環線(OI / IO)只係城巴,app key 一定係單程 I / O', () => {
    g.routes.forEach((r, ri) => {
      if (r.b.length === 1) return
      expect(r.co).toBe('ctb')
      for (let i = 0; i < r.st.length - 1; i++) expect(['I', 'O']).toContain(toAppKey(ix, ri, i).bound)
    })
  })

  it('城巴 11 循環線:第 31 站(龍風臺, 大坑道 第二次出現)喺回程', () => {
    const ri = g.routes.findIndex((r) => r.k === 'ctb|11|OI|1')
    expect(ri).toBeGreaterThanOrEqual(0)
    expect(toAppKey(ix, ri, 0).bound).toBe('O')
    expect(toAppKey(ix, ri, 31).bound).toBe('I')
  })

  it('城巴 76 循環線第一站(黃竹坑站)係去程:正線去程唔經呢個站,要睇埋特別班', () => {
    const ri = g.routes.findIndex((r) => r.k === 'ctb|76|OI|1')
    expect(ri).toBeGreaterThanOrEqual(0)
    expect(toAppKey(ix, ri, 0).bound).toBe('O')
  })
})
