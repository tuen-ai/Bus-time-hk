import { describe, expect, it } from 'vitest'
import { routeCompare, sortRows, type NearbyRow } from './nearby'

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
