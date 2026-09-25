import { describe, expect, it } from 'vitest'
import type { Eta } from '../api/bus'
import { etaMinutes, favToRoute } from './favRoute'

const NOW = Date.parse('2026-09-25T08:00:00+08:00')
const eta = (mins: number | null, seq = 1): Eta => ({
  co: 'kmb',
  route: '1A',
  dir: 'O',
  service_type: 1,
  seq: 1,
  dest_tc: '中秀茂坪',
  eta_seq: seq,
  eta: mins == null ? null : new Date(NOW + mins * 60_000).toISOString(),
  rmk_tc: '',
  data_timestamp: '',
})

describe('favToRoute', () => {
  it('maps a favourite to a Route', () => {
    expect(
      favToRoute({
        co: 'ctb',
        route: '969',
        bound: 'I',
        serviceType: '1',
        stopId: 'x',
        stopName: 's',
        dest: 'd',
      }),
    ).toEqual({ co: 'ctb', route: '969', bound: 'I', service_type: '1', orig_tc: '', dest_tc: 'd' })
  })
})

describe('etaMinutes', () => {
  it('sorts, drops nulls and long-departed buses, and caps the count', () => {
    expect(
      etaMinutes([eta(12, 2), eta(null, 3), eta(3, 1), eta(-5, 4), eta(25, 5), eta(40, 6)], NOW),
    ).toEqual([3, 12, 25])
  })
  it('keeps a bus that is arriving now', () => {
    expect(etaMinutes([eta(0)], NOW)).toEqual([0])
  })
})
