import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LocationPicker from './LocationPicker'

// Leaflet 喺 jsdom 行唔到:截住 moveend handler 同 setView,自己扮地圖郁
const map = vi.hoisted(() => ({
  moveend: null as null | ((e: { target: { getCenter: () => { lat: number; lng: number } } }) => void),
  setView: (..._args: unknown[]) => {},
}))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  useMap: () => ({ setView: (...args: unknown[]) => map.setView(...args) }),
  useMapEvents: (h: { moveend: typeof map.moveend }) => {
    map.moveend = h.moveend
    return null
  },
}))
vi.mock('../api/geocode', () => ({ geocode: vi.fn(async () => []) }))
vi.mock('../lib/localPlaces', () => ({
  localPlaces: vi.fn(() => [{ label: '葵涌廣場', sub: '地址', lat: 22.3571, lng: 114.1301 }]),
}))

const moveTo = (lat: number, lng: number) =>
  act(() => map.moveend?.({ target: { getCenter: () => ({ lat, lng }) } }))

const renderPicker = () => render(<LocationPicker title="揀終點" onConfirm={vi.fn()} onCancel={vi.fn()} />)

const picked = () => document.querySelector('.addr-sel .plan-val')?.textContent

afterEach(cleanup)

describe('LocationPicker', () => {
  it('開咗焦點落標題;搜尋格有名', () => {
    renderPicker()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '揀終點' }))
    expect(screen.getByRole('searchbox', { name: '搜尋地址或地點' })).toBeTruthy()
  })

  it('揀建議之後,FlyTo 觸發嘅 moveend(差少少像素)唔會將名改做「自訂位置」', async () => {
    const setView = vi.spyOn(map, 'setView')
    renderPicker()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '葵涌' } })
    fireEvent.click(await screen.findByRole('button', { name: /葵涌廣場/ }))
    expect(setView).toHaveBeenCalledWith([22.3571, 114.1301], 17)
    // Leaflet 平移會 trunc 到整數像素:z17 大約 1.07e-5°
    moveTo(22.3571 + 1.07e-5, 114.1301 - 1.07e-5)
    expect(picked()).toBe('葵涌廣場')
    // 真係拖走咗先改
    moveTo(22.36, 114.14)
    expect(picked()).toBe('自訂位置(地圖)')
  })

  it('讀屏狀態:講有幾多個建議;揀咗就收聲', async () => {
    renderPicker()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '葵涌' } })
    expect(await screen.findByText('1 個建議地點', {}, { timeout: 2000 })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /葵涌廣場/ }))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('Esc:有字先清字(唔交畀返回層閂畫面),冇字就唔攔', () => {
    renderPicker()
    const input = screen.getByRole('searchbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '葵涌' } })
    const withText = fireEvent.keyDown(input, { key: 'Escape' })
    expect(withText).toBe(false) // preventDefault 咗
    expect(input.value).toBe('')
    const empty = fireEvent.keyDown(input, { key: 'Escape' })
    expect(empty).toBe(true)
  })
})
