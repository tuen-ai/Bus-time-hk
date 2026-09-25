import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Route } from '../api/bus'
import RouteStopsView from './RouteStopsView'
import { getRouteStops } from '../api/bus'
import { toggleFavorite } from '../lib/store'

// 淨係測:冇站 → 重試;收藏記埋 uid(同號跨區綠van / 嶼巴變體)
vi.mock('../api/bus', () => {
  const key = (r: Route) => `${r.co}|${r.route}|${r.bound}|${r.service_type}`
  return {
    getRouteStops: vi.fn(),
    coLabel: () => '綠van',
    coClass: () => 'co-gmb',
    routeKeyOf: key,
    sameRoute: (a: Route, b: Route) => key(a) === key(b) && (a.uid ?? '') === (b.uid ?? ''),
  }
})
vi.mock('../lib/store', () => ({
  favKey: (f: { stopId: string }) => f.stopId,
  getFavorites: () => [],
  toggleFavorite: vi.fn(() => []),
}))
vi.mock('../lib/routeMeta', () => ({ routeBadges: () => [] }))
vi.mock('../lib/fares', () => ({ getFares: () => Promise.resolve(null), fmtFare: (n: number) => `$${n}` }))
vi.mock('../lib/alarm', () => ({
  getAlarm: () => null,
  subscribeAlarm: () => () => {},
  startAlarm: vi.fn(),
  stopAlarm: vi.fn(),
}))
vi.mock('../lib/chime', () => ({ primeAudio: vi.fn(), askNotify: vi.fn() }))
vi.mock('./EtaPanel', () => ({ default: () => null }))
vi.mock('./TrafficAlert', () => ({ default: () => null }))
vi.mock('./RouteMap', () => ({ default: () => null }))

const gmb: Route = {
  co: 'gmb',
  route: '1',
  bound: 'O',
  service_type: '1',
  orig_tc: '西貢',
  dest_tc: '九龍灣(德福花園)',
  uid: '2002337',
}

afterEach(cleanup)

describe('RouteStopsView:冇站重試 + 收藏 uid', () => {
  it('攞唔到站 → 出重試;撳完再攞一次,有站就顯示', async () => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
    vi.mocked(getRouteStops)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ seq: 1, stopId: 'G1', name: '西貢', lat: 22.38, lng: 114.27 }])
    render(<RouteStopsView route={gmb} variants={[gmb]} onSwitch={vi.fn()} onBack={vi.fn()} />)

    expect(await screen.findByText(/暫時攞唔到呢條線嘅車站資料/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    expect(await screen.findByRole('button', { name: '收藏:西貢' })).toBeTruthy()
    expect(getRouteStops).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/暫時攞唔到/)).toBeNull()

    // 收藏要記住係邊條綠van(uid),之後開返 / 攞 ETA 唔使靠目的地估
    fireEvent.click(screen.getByRole('button', { name: '收藏:西貢' }))
    expect(toggleFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ co: 'gmb', route: '1', stopId: 'G1', uid: '2002337' }),
    )
  })
})
