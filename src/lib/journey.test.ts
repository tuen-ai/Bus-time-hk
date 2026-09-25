import { describe, expect, it } from 'vitest'
import { buildIndex, inflateGraph, loadGraph, type PackedGraph } from './planGraph'
import { fillFare, planJourneys, type Journey, type Leg } from './journey'
import committed from '../data/planGraph.json'

const ix = buildIndex(inflateGraph(committed as unknown as PackedGraph))
const riOf = (k: string) => ix.routeByIdx.findIndex((r) => r.k === k)
const ride = (ri: number, fromSeq: number): Leg => ({ kind: 'ride', mins: 1, ri, fromSeq })
const journey = (legs: Leg[]): Journey => ({ mins: 0, transfers: 0, fare: null, legs })

describe('fillFare:用路線編號 + 上車站序查車費', () => {
  it('同名站唔同價:城巴 11 第二次經「龍風臺, 大坑道」係 $8.6 唔係 $5.3', async () => {
    const ri = riOf('ctb|11|OI|1')
    const st = ix.routeByIdx[ri].st
    // 前提:第 31 站同較早某個站同名(以前靠站名搵就會搵錯)
    const name = (i: number) => ix.graph.stops[st[i]][2]
    expect(st.findIndex((_, i) => name(i) === name(31))).toBeLessThan(31)
    const j = journey([ride(ri, 31)])
    await fillFare(ix, j)
    expect(j.fare).toBe(8.6)
    expect(j.fareNote).toBeUndefined()
  })

  it('冇 index 嘅 ride / 綠van(冇車費資料)→ 標明未涵蓋;行路唔計', async () => {
    const part = journey([
      ride(riOf('ctb|11|OI|1'), 31),
      { kind: 'walk', mins: 3 },
      { kind: 'ride', mins: 1 },
    ])
    await fillFare(ix, part)
    expect(part.fare).toBe(8.6)
    expect(part.fareNote).toBe('部分車費未涵蓋')

    const gmb = journey([
      ride(
        ix.routeByIdx.findIndex((r) => r.co === 'gmb'),
        0,
      ),
    ])
    await fillFare(ix, gmb)
    expect(gmb.fare).toBeNull()
    expect(gmb.fareNote).toBe('車費未涵蓋')
  })
})

describe('planJourneys:ride leg 帶齊 app 路線 key', () => {
  it('co / bound 係 app 用得嘅值,ri + fromSeq 對返上車站', async () => {
    const g = await loadGraph()
    const st = g.routeByIdx[riOf('ctb|11|OI|1')].st
    const at = (i: number) => {
      const [lat, lng] = g.graph.stops[st[i]]
      return { lat, lng }
    }
    const js = await planJourneys(at(31), at(42))
    const rides = js.flatMap((j) => j.legs).filter((l) => l.kind === 'ride')
    expect(rides.length).toBeGreaterThan(0)
    for (const l of rides) {
      expect(['kmb', 'ctb', 'lrt', 'nlb', 'gmb']).toContain(l.co)
      expect(['I', 'O']).toContain(l.bound)
      expect(l.ri).toBeTypeOf('number')
      expect(g.routeByIdx[l.ri!].st[l.fromSeq!]).toBe(l.boardStopId)
      if (l.co === 'ctb') expect(l.serviceType).toBe('1')
    }
  })
})
