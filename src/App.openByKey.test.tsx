import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Route } from './api/bus'
import type { Favorite } from './lib/store'
import App from './App'

// 淨係測 App 由收藏開路線:路線清單未載好 / 某間營辦商攞唔到時,撳收藏唔可以冇反應
const h = vi.hoisted(() => ({
  resolve: null as null | ((rs: Route[]) => void),
  fav: null as unknown as Favorite,
}))

vi.mock('./api/bus', async (orig) => ({
  ...(await orig<typeof import('./api/bus')>()),
  // 清單由 test 話幾時到
  getAllRoutes: vi.fn(
    () =>
      new Promise<Route[]>((res) => {
        h.resolve = res
      }),
  ),
}))
vi.mock('./components/SearchView', () => ({
  default: ({ onOpenFavorite }: { onOpenFavorite: (f: Favorite) => void }) => (
    <button type="button" onClick={() => onOpenFavorite(h.fav)}>
      開收藏
    </button>
  ),
}))
vi.mock('./components/RouteStopsView', () => ({
  default: ({
    route,
    initialOpenStop,
    onBack,
  }: {
    route: Route
    initialOpenStop?: string
    onBack: () => void
  }) => (
    <div>
      <div data-testid="route-page">
        {[
          route.co,
          route.route,
          route.bound,
          route.uid ?? '-',
          route.orig_tc || '-',
          route.dest_tc,
          initialOpenStop,
        ].join('|')}
      </div>
      <button type="button" onClick={onBack}>
        返回
      </button>
    </div>
  ),
}))
vi.mock('./components/WeatherBanner', () => ({ default: () => null }))
vi.mock('./components/AlertBanners', () => ({ default: () => null }))
vi.mock('./lib/planGraph', () => ({ loadGraph: vi.fn(() => new Promise(() => {})) }))
vi.mock('./lib/usage', () => ({ recordUse: vi.fn() }))
vi.mock('./lib/stamps', () => ({ addStamp: vi.fn() }))

const kmbFav: Favorite = {
  co: 'kmb',
  route: '1A',
  bound: 'O',
  serviceType: '1',
  stopId: 'S1',
  stopName: '彌敦道',
  dest: '尖沙咀碼頭',
}
const kmb1A: Route = {
  co: 'kmb',
  route: '1A',
  bound: 'O',
  service_type: '1',
  orig_tc: '中秀茂坪',
  dest_tc: '尖沙咀碼頭',
}
const ctb1: Route = {
  co: 'ctb',
  route: '1',
  bound: 'O',
  service_type: '1',
  orig_tc: '中環',
  dest_tc: '跑馬地',
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => {
  cleanup()
  h.resolve = null
  localStorage.clear()
  history.replaceState(null, '', '/')
})

const tapFav = () => fireEvent.click(screen.getByRole('button', { name: '開收藏' }))
const page = () => screen.findByTestId('route-page')
const listArrives = (rs: Route[]) => act(async () => h.resolve?.(rs))

describe('App:收藏開路線 —— 清單未到都唔可以冇反應', () => {
  it('清單載緊:撳收藏即刻用收藏自己嘅資料開;清單一到靜靜換返真嗰條(有起點)', async () => {
    h.fav = kmbFav
    render(<App />)
    tapFav()
    expect((await page()).textContent).toBe('kmb|1A|O|-|-|尖沙咀碼頭|S1')
    await listArrives([kmb1A, ctb1])
    expect((await page()).textContent).toBe('kmb|1A|O|-|中秀茂坪|尖沙咀碼頭|S1')
  })

  it('清單有嗰間營辦商但對唔到條線:照舊唔開', async () => {
    h.fav = { ...kmbFav, route: '999X' }
    render(<App />)
    await listArrives([kmb1A, ctb1])
    tapFav()
    await act(() => new Promise((r) => setTimeout(r, 0)))
    expect(screen.queryByTestId('route-page')).toBeNull()
  })

  it('九巴清單攞唔到(其他營辦商有):九巴收藏照開到', async () => {
    h.fav = kmbFav
    render(<App />)
    await listArrives([ctb1])
    tapFav()
    expect((await page()).textContent).toBe('kmb|1A|O|-|-|尖沙咀碼頭|S1')
  })

  it('舊綠van 收藏(冇 uid):先開臨時嗰條,清單到咗換返有 uid 嗰條(先攞到站)', async () => {
    h.fav = { ...kmbFav, co: 'gmb', route: '11', serviceType: '1', dest: '寶林' }
    render(<App />)
    tapFav()
    expect((await page()).textContent).toBe('gmb|11|O|-|-|寶林|S1')
    await listArrives([
      { co: 'gmb', route: '11', bound: 'O', service_type: '1', orig_tc: '坑口', dest_tc: '寶林', uid: 'G9' },
    ])
    expect((await page()).textContent).toBe('gmb|11|O|G9|坑口|寶林|S1')
  })

  it('清單未到就返咗出去:清單到咗唔會突然彈個路線頁出嚟', async () => {
    h.fav = kmbFav
    render(<App />)
    tapFav()
    await page()
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(screen.queryByTestId('route-page')).toBeNull()
    await listArrives([kmb1A])
    await act(() => new Promise((r) => setTimeout(r, 0)))
    expect(screen.queryByTestId('route-page')).toBeNull()
  })
})
