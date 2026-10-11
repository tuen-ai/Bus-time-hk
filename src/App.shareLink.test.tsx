import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Route } from './api/bus'
import App from './App'

// 分享連結 / 主畫面捷徑:開 app 時(cold load)同開住時(hashchange)都要開到
const h = vi.hoisted(() => ({ resolve: null as null | ((rs: Route[]) => void) }))

vi.mock('./api/bus', async (orig) => ({
  ...(await orig<typeof import('./api/bus')>()),
  getAllRoutes: vi.fn(
    () =>
      new Promise<Route[]>((res) => {
        h.resolve = res
      }),
  ),
}))
vi.mock('./components/SearchView', () => ({ default: () => <div data-testid="search">搜尋頁</div> }))
vi.mock('./components/NearbyView', () => ({ default: () => <div data-testid="nearby">附近頁</div> }))
vi.mock('./components/RouteStopsView', () => ({
  default: ({ route, initialOpenStop }: { route: Route; initialOpenStop?: string }) => (
    <div data-testid="route-page">
      {[route.co, route.route, route.bound, route.orig_tc || '-', initialOpenStop ?? '-'].join('|')}
    </div>
  ),
}))
vi.mock('./components/WeatherBanner', () => ({ default: () => null }))
vi.mock('./components/AlertBanners', () => ({ default: () => null }))
vi.mock('./lib/planGraph', () => ({ loadGraph: vi.fn(() => new Promise(() => {})) }))
vi.mock('./lib/usage', () => ({ recordUse: vi.fn() }))
vi.mock('./lib/stamps', () => ({ addStamp: vi.fn() }))

const kmb1A: Route = {
  co: 'kmb',
  route: '1A',
  bound: 'O',
  service_type: '1',
  orig_tc: '中秀茂坪',
  dest_tc: '尖沙咀碼頭',
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

const listArrives = (rs: Route[]) => act(async () => h.resolve?.(rs))
const page = () => screen.findByTestId('route-page')
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)))

describe('App:分享連結', () => {
  it('cold load #r=…/站:即刻開路線 + 站,清走 hash;清單到咗換返真嗰條', async () => {
    history.replaceState(null, '', '/Bus-time-hk/#r=kmb/1A/O/1/S1')
    render(<App />)
    expect((await page()).textContent).toBe('kmb|1A|O|-|S1')
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/Bus-time-hk/')
    await listArrives([kmb1A])
    expect((await page()).textContent).toBe('kmb|1A|O|中秀茂坪|S1')
  })

  it('開住 app 時 hashchange 都開到', async () => {
    render(<App />)
    await listArrives([kmb1A])
    expect(screen.queryByTestId('route-page')).toBeNull()
    act(() => {
      history.replaceState(null, '', '/#r=kmb/1A/O/1')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect((await page()).textContent).toBe('kmb|1A|O|中秀茂坪|-')
  })

  it('壞連結:提示,留喺首頁', async () => {
    history.replaceState(null, '', '/#r=kmb/1A')
    render(<App />)
    expect(await screen.findByText('連結唔啱,返咗首頁')).toBeTruthy()
    expect(screen.queryByTestId('route-page')).toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('清單有嗰間營辦商但冇呢條線:提示,唔開', async () => {
    render(<App />)
    await listArrives([kmb1A])
    act(() => {
      history.replaceState(null, '', '/#r=kmb/999X/O/1')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(await screen.findByText('搵唔到連結入面嘅路線')).toBeTruthy()
    expect(screen.queryByTestId('route-page')).toBeNull()
  })

  it('cold load 未知路線:先開臨時頁,清單到咗對唔到就返首頁 + 提示', async () => {
    history.replaceState(null, '', '/#r=kmb/999X/O/1')
    render(<App />)
    await page()
    await listArrives([kmb1A])
    await flush()
    expect(screen.queryByTestId('route-page')).toBeNull()
    expect(screen.getByText('搵唔到連結入面嘅路線')).toBeTruthy()
  })

  it('主畫面捷徑 #tab=nearby:直達附近分頁', async () => {
    history.replaceState(null, '', '/#tab=nearby')
    render(<App />)
    expect(await screen.findByTestId('nearby')).toBeTruthy()
    expect(window.location.hash).toBe('')
  })

  it('#tab=favs:留喺首頁(收藏喺首頁)', async () => {
    history.replaceState(null, '', '/#tab=favs')
    render(<App />)
    expect(await screen.findByTestId('search')).toBeTruthy()
  })
})
