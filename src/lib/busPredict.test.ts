import { describe, expect, it } from 'vitest'
import type { Feature, LineString } from 'geojson'
import { predictBuses, sameBuses, snapStops, type PredictedBus } from './busPredict'

// 一條向北直線,約 2.2 公里,3 個站
const line: Feature<LineString> = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'LineString',
    coordinates: [
      [114.17, 22.3],
      [114.17, 22.32],
    ],
  },
}
const stops = [
  { seq: 1, lat: 22.3, lng: 114.17 },
  { seq: 2, lat: 22.31, lng: 114.17 },
  { seq: 3, lat: 22.32, lng: 114.17 },
]
const NOW = 1_800_000_000_000

describe('sameBuses', () => {
  const bus: PredictedBus = { lat: 22.31, lng: 114.17, minsToNext: 3, seq: 2 }

  it('同一個 array / 內容一樣 → true', () => {
    const a = [bus]
    expect(sameBuses(a, a)).toBe(true)
    expect(sameBuses([], [])).toBe(true)
    expect(sameBuses([bus], [{ ...bus, lat: bus.lat + 1e-8 }])).toBe(true)
  })

  it('數量、分鐘、站或者位置變咗 → false', () => {
    expect(sameBuses([bus], [])).toBe(false)
    expect(sameBuses([bus], [{ ...bus, minsToNext: 2 }])).toBe(false)
    expect(sameBuses([bus], [{ ...bus, seq: 3 }])).toBe(false)
    expect(sameBuses([bus], [{ ...bus, lat: bus.lat + 0.0001 }])).toBe(false)
  })
})

describe('predictBuses', () => {
  const snapped = snapStops(line, stops)

  it('冇 ETA → 冇車', () => {
    expect(predictBuses(line, snapped, new Map(), NOW)).toEqual([])
  })

  it('架車喺下一站之前、未去到', () => {
    const eta = new Map([
      [2, NOW + 60_000],
      [3, NOW + 180_000],
    ])
    const [b] = predictBuses(line, snapped, eta, NOW)
    expect(b.seq).toBe(2)
    expect(b.minsToNext).toBe(1)
    expect(b.lat).toBeGreaterThan(22.3)
    expect(b.lat).toBeLessThan(22.31)
  })

  it('推算結果每次都係新 array,要靠 sameBuses 判斷有冇變', () => {
    const a = predictBuses(line, snapped, new Map(), NOW)
    const b = predictBuses(line, snapped, new Map(), NOW + 1000)
    expect(a).not.toBe(b)
    expect(sameBuses(a, b)).toBe(true)
  })
})
