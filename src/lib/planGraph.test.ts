import { describe, expect, it } from 'vitest'
import { buildIndex, nearStops, stopName, type PlanGraph } from './planGraph'

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
