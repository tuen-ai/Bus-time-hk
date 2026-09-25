import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Route } from '../api/bus'
import RouteStopsView from './RouteStopsView'
import { getRouteStops } from '../api/bus'
import { toggleFavorite, type Favorite } from '../lib/store'

// 淨係測:冇站 → 重試;收藏記埋 uid(同號跨區綠van / 嶼巴變體);循環線同站兩行;錯誤字唔重複
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
const saved = vi.hoisted(() => ({ list: [] as Favorite[] }))
// favKey / sameFav 用真嘅(uid 對唔對得到就係要測嘅嘢);讀寫 localStorage 嗰啲換走
vi.mock('../lib/store', async (orig) => ({
  ...(await orig<typeof import('../lib/store')>()),
  getFavorites: () => saved.list,
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
// 記低 EtaPanel 收到嘅 route object:換咗 = 真 EtaPanel 會清走班次、閃返 skeleton 再攞過
const etaRoutes = vi.hoisted(() => ({ seen: new Set<unknown>() }))
vi.mock('./EtaPanel', () => ({
  default: ({ stopId, route }: { stopId: string; route: unknown }) => {
    etaRoutes.seen.add(route)
    return <div>ETA {stopId}</div>
  },
}))
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
const G1 = { seq: 1, stopId: 'G1', name: '西貢', lat: 22.38, lng: 114.27 }

const favAt = (uid: string | undefined): Favorite => ({
  co: 'gmb',
  route: '1',
  bound: 'O',
  serviceType: '1',
  stopId: 'G1',
  stopName: '西貢',
  dest: '九龍灣(德福花園)',
  ...(uid ? { uid } : {}),
})

window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
afterEach(() => {
  cleanup()
  saved.list = []
  vi.mocked(getRouteStops).mockReset()
})

describe('RouteStopsView:冇站重試 + 收藏 uid', () => {
  it('攞唔到站 → 出重試;撳完再攞一次,有站就顯示', async () => {
    vi.mocked(getRouteStops).mockResolvedValueOnce([]).mockResolvedValueOnce([G1])
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

  it('同站另一個變體(uid 唔同)收藏咗:呢條線個星唔亮;舊收藏(冇 uid)就照亮', async () => {
    vi.mocked(getRouteStops).mockResolvedValue([G1])
    saved.list = [favAt('9999999')]
    render(<RouteStopsView route={gmb} variants={[gmb]} onSwitch={vi.fn()} onBack={vi.fn()} />)
    const star = await screen.findByRole('button', { name: '收藏:西貢' })
    expect(star.getAttribute('aria-pressed')).toBe('false')
    cleanup()

    saved.list = [favAt(undefined)]
    render(<RouteStopsView route={gmb} variants={[gmb]} onSwitch={vi.fn()} onBack={vi.fn()} />)
    expect((await screen.findByRole('button', { name: '收藏:西貢' })).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })
})

describe('RouteStopsView:循環線同一個站出現兩次', () => {
  const loop = [
    { seq: 1, stopId: 'L1', name: '總站', lat: 22.3, lng: 114.2 },
    { seq: 2, stopId: 'L2', name: '中途站', lat: 22.31, lng: 114.21 },
    { seq: 3, stopId: 'L1', name: '總站', lat: 22.3, lng: 114.2 },
  ]
  // 站掣(唔計鐘仔 / 星):兩行「總站」
  const mainBtns = () =>
    [...document.querySelectorAll<HTMLButtonElement>('.stop-main')].filter((b) =>
      b.textContent?.includes('總站'),
    )

  it('每行 id 唔撞;撳尾嗰行淨係開嗰一行(唔會兩行一齊開、兩個 ETA)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getRouteStops).mockResolvedValue(loop)
    const { container } = render(
      <RouteStopsView route={gmb} variants={[gmb]} onSwitch={vi.fn()} onBack={vi.fn()} />,
    )
    await screen.findByText('中途站')
    const ids = [...container.querySelectorAll('.stop-item')].map((li) => li.id)
    expect(ids).toEqual(['stop-L1', 'stop-L2', 'stop-L1-3'])

    fireEvent.click(mainBtns()[1])
    expect(mainBtns().map((b) => b.getAttribute('aria-expanded'))).toEqual(['false', 'true'])
    expect(screen.getAllByText('ETA L1')).toHaveLength(1)
    // 再撳同一行收返
    fireEvent.click(mainBtns()[1])
    expect(screen.queryByText('ETA L1')).toBeNull()
    // 冇 React duplicate key 警告
    expect(err.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false)
    err.mockRestore()
  })

  it('由收藏帶住個站開入嚟:只開第一行', async () => {
    vi.mocked(getRouteStops).mockResolvedValue(loop)
    render(
      <RouteStopsView
        route={gmb}
        variants={[gmb]}
        initialOpenStop="L1"
        onSwitch={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    await screen.findByText('ETA L1')
    expect(mainBtns().map((b) => b.getAttribute('aria-expanded'))).toEqual(['true', 'false'])
  })
})

describe('RouteStopsView:標題 / 錯誤字', () => {
  it('臨時路線冇起點(清單未載好由收藏開):唔出淨係「由 」', async () => {
    vi.mocked(getRouteStops).mockResolvedValue([G1])
    const { container } = render(
      <RouteStopsView route={{ ...gmb, orig_tc: '' }} variants={[]} onSwitch={vi.fn()} onBack={vi.fn()} />,
    )
    await screen.findByRole('button', { name: '收藏:西貢' })
    expect(
      [...container.querySelectorAll('.route-dest .muted')].some((d) => /^由/.test(d.textContent ?? '')),
    ).toBe(false)
    cleanup()
    render(<RouteStopsView route={gmb} variants={[]} onSwitch={vi.fn()} onBack={vi.fn()} />)
    expect(await screen.findByText('由 西貢')).toBeTruthy()
  })

  it('自己拋嘅中文錯誤照出,唔會「車站資料載入唔到:…車站資料載入唔到…」講兩次', async () => {
    vi.mocked(getRouteStops).mockRejectedValue(new Error('綠van 車站資料載入唔到,請檢查網絡再試'))
    render(<RouteStopsView route={gmb} variants={[gmb]} onSwitch={vi.fn()} onBack={vi.fn()} />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('綠van 車站資料載入唔到,請檢查網絡再試')
    expect(alert.textContent?.match(/載入唔到/g)).toHaveLength(1)
  })

  it('英文錯誤:加前綴 + 轉廣東話', async () => {
    vi.mocked(getRouteStops).mockRejectedValue(new TypeError('Failed to fetch'))
    render(<RouteStopsView route={gmb} variants={[gmb]} onSwitch={vi.fn()} onBack={vi.fn()} />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/車站資料載入唔到:/)
    expect(alert.textContent).not.toMatch(/Failed/)
  })
})

describe('RouteStopsView:清單到咗,App 將臨時路線換返真嗰條', () => {
  const provisional: Route = { ...gmb, orig_tc: '' }
  const view = (route: Route) => (
    <RouteStopsView route={route} variants={[]} initialOpenStop="G1" onSwitch={vi.fn()} onBack={vi.fn()} />
  )

  it('同一條線淨係補咗起點:「由」即刻出,但唔會重新載站列 / ETA(唔閃)', async () => {
    vi.mocked(getRouteStops).mockResolvedValue([G1])
    etaRoutes.seen.clear()
    const { rerender } = render(view(provisional))
    await screen.findByText('ETA G1')
    rerender(view({ ...gmb }))
    expect(await screen.findByText('由 西貢')).toBeTruthy()
    expect(screen.getByText('ETA G1')).toBeTruthy()
    expect(getRouteStops).toHaveBeenCalledTimes(1)
    expect(etaRoutes.seen.size).toBe(1)
  })

  it('真係另一條(uid / 目的地唔同)就照重新載', async () => {
    vi.mocked(getRouteStops).mockResolvedValue([G1])
    const { rerender } = render(view(provisional))
    await screen.findByText('ETA G1')
    rerender(view({ ...gmb, uid: '2002338' }))
    await screen.findByText('ETA G1')
    expect(getRouteStops).toHaveBeenCalledTimes(2)
    rerender(view({ ...gmb, uid: '2002338', dest_tc: '牛池灣' }))
    await screen.findByText('ETA G1')
    expect(getRouteStops).toHaveBeenCalledTimes(3)
  })
})
