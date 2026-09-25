import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Route } from '../api/bus'
import RouteStopsView from './RouteStopsView'
import { getRouteStops } from '../api/bus'

// 站列用假資料;地圖、ETA、交通消息、鬧鐘全部 stub 走,淨係測站列 / 轉方向邏輯
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

const route = (bound: 'I' | 'O', orig: string, dest: string): Route => ({
  co: 'kmb',
  route: '1A',
  bound,
  service_type: '1',
  orig_tc: orig,
  dest_tc: dest,
})
const out = route('O', '中秀茂坪', '尖沙咀碼頭')
const back = route('I', '尖沙咀碼頭', '中秀茂坪')

// 去程三個站;回程喺對面馬路(同名、約 60 米)
const stopsOf = (r: Route) =>
  r.bound === 'O'
    ? [
        { seq: 1, stopId: 'o1', name: '中秀茂坪', lat: 22.32, lng: 114.23 },
        { seq: 2, stopId: 'o2', name: '彌敦道 (KT968)', lat: 22.31, lng: 114.17 },
        { seq: 3, stopId: 'o3', name: '尖沙咀碼頭', lat: 22.294, lng: 114.168 },
      ]
    : [
        { seq: 1, stopId: 'i1', name: '尖沙咀碼頭', lat: 22.2942, lng: 114.1682 },
        { seq: 2, stopId: 'i2', name: '佐敦道', lat: 22.3102, lng: 114.1702 },
        { seq: 3, stopId: 'i3', name: '彌敦道 (KT969)', lat: 22.3105, lng: 114.1702 },
        { seq: 4, stopId: 'i4', name: '中秀茂坪', lat: 22.3201, lng: 114.2301 },
      ]

const scrollIntoView = vi.fn()

beforeEach(() => {
  vi.mocked(getRouteStops).mockImplementation(async (r) => stopsOf(r))
  Element.prototype.scrollIntoView = scrollIntoView
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => {
  cleanup()
})

// 站掣名 = 站序 + 站名(jsdom 冇 layout,inline span 之間唔會加空格)
const stopName = (seq: number, name: string) => new RegExp(`^${seq}\\s?${name}`)
const expanded = (seq: number, name: string) =>
  screen.getByRole('button', { name: stopName(seq, name) }).getAttribute('aria-expanded')

describe('RouteStopsView', () => {
  it('預選站:載完捲到畫面中間,焦點落路線標題', async () => {
    render(
      <RouteStopsView
        route={out}
        variants={[out, back]}
        initialOpenStop="o3"
        onSwitch={() => {}}
        onBack={() => {}}
      />,
    )
    await screen.findByText('ETA o3')
    expect(expanded(3, '尖沙咀碼頭')).toBe('true')
    // 捲動喺下一個 frame 先做
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    expect(scrollIntoView.mock.instances[0]).toBe(document.getElementById('stop-o3'))
    expect(scrollIntoView.mock.calls[0][0]).toMatchObject({ block: 'center' })
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }))
  })

  it('用家自己撳站唔會再捲', async () => {
    render(<RouteStopsView route={out} variants={[out, back]} onSwitch={() => {}} onBack={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: stopName(2, '彌敦道') }))
    await screen.findByText('ETA o2')
    await new Promise((r) => setTimeout(r, 50)) // 等埋下一個 frame
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('⇄ 返程:轉去相反方向,自動打開對面同名嘅站再捲過去', async () => {
    const onSwitch = vi.fn()
    const { rerender } = render(
      <RouteStopsView
        route={out}
        variants={[out, back]}
        initialOpenStop="o2"
        onSwitch={onSwitch}
        onBack={() => {}}
      />,
    )
    await screen.findByText('ETA o2')
    fireEvent.click(screen.getByRole('button', { name: '返程:往 中秀茂坪' }))
    expect(onSwitch).toHaveBeenCalledWith(back)

    rerender(<RouteStopsView route={back} variants={[out, back]} onSwitch={onSwitch} onBack={() => {}} />)
    // 佐敦道近啲,但同名(彌敦道)優先
    await screen.findByText('ETA i3')
    expect(screen.queryByText('ETA i2')).toBeNull()
    expect(expanded(3, '彌敦道')).toBe('true')
    await waitFor(() => expect(scrollIntoView.mock.instances.at(-1)).toBe(document.getElementById('stop-i3')))
  })

  it('方向 chip 標示揀咗邊個(aria-pressed),撳另一個一樣帶站過去', async () => {
    const onSwitch = vi.fn()
    const { rerender } = render(
      <RouteStopsView
        route={out}
        variants={[out, back]}
        initialOpenStop="o1"
        onSwitch={onSwitch}
        onBack={() => {}}
      />,
    )
    await screen.findByText('ETA o1')
    const chipOut = screen.getByRole('button', { name: '往 尖沙咀碼頭' })
    const chipBack = screen.getByRole('button', { name: '往 中秀茂坪' })
    expect(chipOut.getAttribute('aria-pressed')).toBe('true')
    expect(chipBack.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(chipBack)
    rerender(<RouteStopsView route={back} variants={[out, back]} onSwitch={onSwitch} onBack={() => {}} />)
    await screen.findByText('ETA i4')
  })

  it('撳完 ⇄ 未載完就返回,再由收藏開返嗰條線:以收藏個站為準', async () => {
    render(
      <RouteStopsView
        route={out}
        variants={[out, back]}
        initialOpenStop="o2"
        onSwitch={() => {}}
        onBack={() => {}}
      />,
    )
    await screen.findByText('ETA o2')
    fireEvent.click(screen.getByRole('button', { name: '返程:往 中秀茂坪' }))
    cleanup() // App 撳返回:路線頁 unmount,carry 冇用到

    render(
      <RouteStopsView
        route={back}
        variants={[out, back]}
        initialOpenStop="i1"
        onSwitch={() => {}}
        onBack={() => {}}
      />,
    )
    await screen.findByText('ETA i1')
    expect(screen.queryByText('ETA i3')).toBeNull()
  })

  it('循環線 / 冇相反方向就唔出 ⇄', async () => {
    const circ = route('O', '竹園邨', '竹園邨')
    render(<RouteStopsView route={circ} variants={[circ]} onSwitch={() => {}} onBack={() => {}} />)
    await screen.findByRole('button', { name: stopName(1, '中秀茂坪') })
    expect(screen.queryByRole('button', { name: /返程/ })).toBeNull()
  })

  it('載入失敗:唔出英文錯誤,撳重試再載', async () => {
    vi.mocked(getRouteStops).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<RouteStopsView route={out} variants={[out]} onSwitch={() => {}} onBack={() => {}} />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toMatch(/Failed to fetch/)
    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    await screen.findByRole('button', { name: stopName(3, '尖沙咀碼頭') })
  })
})
