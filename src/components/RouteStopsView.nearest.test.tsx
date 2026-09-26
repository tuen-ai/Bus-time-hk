import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Route } from '../api/bus'
import RouteStopsView from './RouteStopsView'
import { getRouteStops } from '../api/bus'
import { geoPermission, getNearbyFix } from '../lib/geo'
import { autoNearestOn } from '../lib/autoNearest'

// 同 RouteStopsView.test.tsx 一樣:站列用假資料,地圖 / ETA / 交通消息 / 鬧鐘 stub 走
vi.mock('../api/bus', () => {
  const key = (r: Route) => `${r.co}|${r.route}|${r.bound}|${r.service_type}`
  return {
    getRouteStops: vi.fn(),
    coLabel: () => '九巴',
    coClass: () => '',
    routeKeyOf: key,
    sameRoute: (a: Route, b: Route) => key(a) === key(b) && (a.uid ?? '') === (b.uid ?? ''),
  }
})
vi.mock('../lib/store', async (orig) => ({
  ...(await orig<typeof import('../lib/store')>()),
  getFavorites: () => [],
  toggleFavorite: () => [],
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
vi.mock('./EtaPanel', () => ({ default: ({ stopId }: { stopId: string }) => <div>ETA {stopId}</div> }))
vi.mock('./TrafficAlert', () => ({ default: () => null }))
vi.mock('./RouteMap', () => ({ default: () => null }))
// 定位:淨係 mock 攞位置同權限,距離 / 錯誤字眼用真嘅
vi.mock('../lib/geo', async (orig) => ({
  ...(await orig<typeof import('../lib/geo')>()),
  getNearbyFix: vi.fn(),
  geoPermission: vi.fn(),
}))
vi.mock('../lib/autoNearest', () => ({ autoNearestOn: vi.fn(() => true), setAutoNearest: vi.fn() }))

const route = (bound: 'I' | 'O', orig: string, dest: string): Route => ({
  co: 'kmb',
  route: '32',
  bound,
  service_type: '1',
  orig_tc: orig,
  dest_tc: dest,
})
const out = route('O', '奧運站', '荃灣(石圍角)')
const back = route('I', '荃灣(石圍角)', '奧運站')

// 每 0.003 度緯度 ≈ 333 米
const LAT = 22.3
const LNG = 114.17
const stopsOf = (r: Route) =>
  r.bound === 'O'
    ? [
        { seq: 1, stopId: 'o1', name: '奧運站巴士總站', lat: LAT, lng: LNG },
        { seq: 2, stopId: 'o2', name: '富貴街', lat: LAT + 0.003, lng: LNG },
        { seq: 3, stopId: 'o3', name: '櫸樹街', lat: LAT + 0.006, lng: LNG },
        { seq: 4, stopId: 'o4', name: '石圍角總站', lat: LAT + 0.009, lng: LNG },
      ]
    : [
        { seq: 1, stopId: 'i1', name: '石圍角總站', lat: LAT + 0.0091, lng: LNG + 0.0003 },
        { seq: 2, stopId: 'i2', name: '櫸樹街', lat: LAT + 0.0061, lng: LNG + 0.0003 },
        { seq: 3, stopId: 'i3', name: '奧運站巴士總站', lat: LAT + 0.0001, lng: LNG + 0.0003 },
      ]

const at = (dLat: number) => ({ lat: LAT + dLat, lng: LNG })
const scrollIntoView = vi.fn()

beforeEach(() => {
  vi.mocked(getRouteStops).mockImplementation(async (r) => stopsOf(r))
  vi.mocked(geoPermission).mockResolvedValue('granted')
  vi.mocked(getNearbyFix).mockResolvedValue(at(0.0031)) // 富貴街旁邊
  vi.mocked(autoNearestOn).mockReturnValue(true)
  Element.prototype.scrollIntoView = scrollIntoView
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const stopName = (seq: number, name: string) => new RegExp(`^${seq}\\s?${name}`)
const expanded = (seq: number, name: string) =>
  screen.getByRole('button', { name: stopName(seq, name) }).getAttribute('aria-expanded')
const view = (r: Route, initialOpenStop?: string) => (
  <RouteStopsView
    route={r}
    variants={[out, back]}
    initialOpenStop={initialOpenStop}
    onSwitch={() => {}}
    onBack={() => {}}
  />
)

describe('RouteStopsView 自動打開最近你嘅站', () => {
  it('由搜尋開線:打開最近嘅站、捲過去、顯示「最近你」', async () => {
    render(view(out))
    await screen.findByText('ETA o2')
    expect(expanded(2, '富貴街')).toBe('true')
    await waitFor(() => expect(scrollIntoView.mock.instances.at(-1)).toBe(document.getElementById('stop-o2')))
    expect(screen.getByRole('button', { name: /最近你:富貴街 · 約 \d+ 米/ })).toBeTruthy()
  })

  it('企喺尾站都唔會揀尾站(淨係落客),揀前一個上得車嘅站', async () => {
    vi.mocked(getNearbyFix).mockResolvedValue(at(0.009))
    render(view(out))
    await screen.findByText('ETA o3')
    expect(expanded(4, '石圍角總站')).toBe('false')
  })

  it('由收藏 / 附近帶住站開:唔會自動定位', async () => {
    render(view(out, 'o4'))
    await screen.findByText('ETA o4')
    await new Promise((r) => setTimeout(r, 20))
    expect(getNearbyFix).not.toHaveBeenCalled()
    expect(screen.queryByText(/最近你/)).toBeNull()
  })

  it('等定位嗰陣用家自己撳咗站:唔會搶走', async () => {
    let resolve!: (v: { lat: number; lng: number }) => void
    vi.mocked(getNearbyFix).mockReturnValue(new Promise((r) => (resolve = r)))
    render(view(out))
    await screen.findByText(/搵緊離你最近嘅站/)
    fireEvent.click(screen.getByRole('button', { name: stopName(3, '櫸樹街') }))
    await screen.findByText('ETA o3')
    resolve(at(0.0031))
    await waitFor(() => expect(screen.queryByText(/搵緊離你最近嘅站/)).toBeNull())
    expect(screen.queryByText('ETA o2')).toBeNull()
    expect(expanded(3, '櫸樹街')).toBe('true')
  })

  it('離呢條線太遠(>1 公里):唔自動打開,提示 + 撳「打開」先開', async () => {
    vi.mocked(getNearbyFix).mockResolvedValue(at(0.05)) // 約 5 公里外
    render(view(out))
    await screen.findByText(
      (_, el) =>
        !!el?.classList.contains('muted') &&
        /你附近冇呢條線嘅站.最近.櫸樹街 · \d\.\d 公里/.test(el.textContent ?? ''),
    )
    expect(screen.queryByText(/^ETA /)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '打開' }))
    await screen.findByText('ETA o3')
  })

  it('設定閂咗:唔定位,畀個掣自己撳', async () => {
    vi.mocked(autoNearestOn).mockReturnValue(false)
    render(view(out))
    const btn = await screen.findByRole('button', { name: /搵最近我嘅站/ })
    expect(getNearbyFix).not.toHaveBeenCalled()
    fireEvent.click(btn)
    await screen.findByText('ETA o2')
    expect(getNearbyFix).toHaveBeenCalledTimes(1)
  })

  it('拒絕咗定位權限:唔定位,亦唔出提示煩你', async () => {
    vi.mocked(geoPermission).mockResolvedValue('denied')
    render(view(out))
    await screen.findByRole('button', { name: stopName(1, '奧運站巴士總站') })
    await new Promise((r) => setTimeout(r, 20))
    expect(getNearbyFix).not.toHaveBeenCalled()
    expect(screen.queryByRole('status', { name: '' })?.textContent ?? '').not.toMatch(/最近/)
    expect(screen.queryByRole('button', { name: /搵最近我嘅站/ })).toBeNull()
  })

  it('自動定位失敗:畀個掣再試;再試俾人拒絕就講點開返權限', async () => {
    vi.mocked(getNearbyFix).mockRejectedValue(Object.assign(new Error('定位逾時'), { code: 3 }))
    render(view(out))
    const btn = await screen.findByRole('button', { name: /搵最近我嘅站/ })
    vi.mocked(getNearbyFix).mockRejectedValue({ code: 1 })
    fireEvent.click(btn)
    await screen.findByText(/定位權限被拒絕/)
  })

  it('轉方向(冇打開站):新方向再自動搵一次', async () => {
    const { rerender } = render(view(out))
    await screen.findByText('ETA o2')
    // 撳返埋個站 → 冇站打開 → 轉去返程
    fireEvent.click(screen.getByRole('button', { name: stopName(2, '富貴街') }))
    vi.mocked(getNearbyFix).mockResolvedValue(at(0.0062))
    rerender(view(back))
    await screen.findByText('ETA i2')
    expect(getNearbyFix).toHaveBeenCalledTimes(2)
  })
})
