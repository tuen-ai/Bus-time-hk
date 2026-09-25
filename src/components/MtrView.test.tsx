import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import MtrView from './MtrView'

// 地圖唔係呢度要測嘅嘢:react-leaflet 換做空殼
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

describe('MtrView 綫 chip', () => {
  afterEach(cleanup)

  it('揀咗嘅綫有 aria-pressed,綫色經 --line-c 傳,唔再 inline 寫字色', () => {
    render(<MtrView />)
    const twl = screen.getByRole('button', { name: '荃灣綫' })
    const sil = screen.getByRole('button', { name: '南港島綫' })
    expect(twl.getAttribute('aria-pressed')).toBe('true')
    expect(sil.getAttribute('aria-pressed')).toBe('false')
    expect(sil.style.getPropertyValue('--line-c').toLowerCase()).toBe('#bac429')
    expect(sil.style.color).toBe('')
    expect(sil.style.background).toBe('')

    fireEvent.click(sil)
    expect(sil.getAttribute('aria-pressed')).toBe('true')
    expect(twl.getAttribute('aria-pressed')).toBe('false')
  })

  it('轉車站寫埋綫名(唔止靠色點);唔識嘅綫(例如迪士尼綫)唔會出', () => {
    render(<MtrView />)
    fireEvent.click(screen.getByRole('button', { name: '東涌綫' }))
    expect(screen.getByRole('button', { name: /香港\s*轉機場快綫/ })).toBeTruthy()
    const sunny = screen.getByRole('button', { name: /欣澳/ })
    expect(sunny.textContent).not.toContain('轉')
  })
})
