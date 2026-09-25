import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { StationSchedule } from '../api/mtr'
import MtrView from './MtrView'

// 鐵路頁記住上次揀嘅綫 / 站(首頁港鐵收藏撳入嚟都靠呢個)
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Polyline: () => null,
  CircleMarker: () => null,
  useMap: () => ({
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    setView: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    scrollWheelZoom: { enable: vi.fn(), disable: vi.fn() },
  }),
}))
const fetchSchedule = vi.fn<() => Promise<StationSchedule>>()
vi.mock('../api/mtr', () => ({ fetchSchedule: () => fetchSchedule() }))

const LAST = 'kkcx.mtr.last'
const last = () => JSON.parse(localStorage.getItem(LAST) ?? 'null')
const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')

describe('MtrView 記住上次揀嘅綫 / 站', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchSchedule.mockReset()
    fetchSchedule.mockReturnValue(new Promise(() => {})) // 班次唔係呢度要測嘅嘢
  })
  afterEach(() => {
    cleanup()
    localStorage.clear()
    delete (Element.prototype as Partial<Element>).scrollIntoView // jsdom 本身冇
  })

  it('第一次入嚟:預設荃灣綫', () => {
    render(<MtrView />)
    expect(pressed('荃灣綫')).toBe('true')
    expect(last()).toEqual({ line: 'TWL', sta: null })
  })

  it('換綫 / 開站就記低;再入嚟打開返同一個站並捲過去', async () => {
    const { unmount } = render(<MtrView />)
    fireEvent.click(screen.getByRole('button', { name: '港島綫' }))
    fireEvent.click(screen.getByRole('button', { name: /^中環/ }))
    expect(last()).toEqual({ line: 'ISL', sta: 'CEN' })
    unmount()

    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    render(<MtrView />)
    expect(pressed('港島綫')).toBe('true')
    const cen = screen.getByRole('button', { name: /^中環/ })
    expect(cen.getAttribute('aria-expanded')).toBe('true')
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))))
    expect(scroll).toHaveBeenCalledTimes(1)
    // 焦點本身冇喺任何掣(例如由首頁收藏卡撳入嚟)→ 放上個站
    expect(document.activeElement).toBe(cen)
  })

  it('首頁寫低嘅綫 / 站(App openMtr)→ 直接打開', () => {
    localStorage.setItem(LAST, JSON.stringify({ line: 'EAL', sta: 'SHT' }))
    render(<MtrView />)
    expect(pressed('東鐵綫')).toBe('true')
    expect(screen.getByRole('button', { name: /^沙田/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('壞資料 / 唔識嘅綫 → 返荃灣綫;站唔喺嗰條綫就淨係揀綫', () => {
    localStorage.setItem(LAST, '{oops')
    render(<MtrView />)
    expect(pressed('荃灣綫')).toBe('true')
    cleanup()

    localStorage.setItem(LAST, JSON.stringify({ line: 'SIL', sta: 'TST' }))
    render(<MtrView />)
    expect(pressed('南港島綫')).toBe('true')
    expect(document.querySelector('[aria-expanded="true"]')).toBeNull()
  })
})
