import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MascotGreeting, MascotState, MascotWelcome } from './Mascots'
import { MASCOT_KEY, getMascotSet, resetDangoMissing, setMascotSet } from '../lib/mascotPref'

vi.mock('../api/weather', () => ({ getWeather: vi.fn(() => new Promise(() => {})) }))

afterEach(() => {
  cleanup()
  localStorage.clear()
  resetDangoMissing()
})

describe('長草顏團子(預覽)', () => {
  it('預設係熊貓啡熊,唔出團子', () => {
    expect(getMascotSet()).toBe('classic')
    const { container } = render(<MascotState mood="busy" text="載入中" />)
    expect(container.querySelector('.dango-sticker')).toBeNull()
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('揀咗團子:載入中跳舞、出錯喊;lazy + 固定闊高 + 減少動態效果用靜態圖', () => {
    setMascotSet('dango')
    expect(localStorage.getItem(MASCOT_KEY)).toBe('dango')
    const { container } = render(
      <>
        <MascotState mood="busy" text="a" />
        <MascotState mood="sad" text="b" />
      </>,
    )
    const imgs = container.querySelectorAll('img')
    expect(imgs[0].getAttribute('src')).toMatch(/kaodango-dance\.webp$/)
    expect(imgs[1].getAttribute('src')).toMatch(/kaodango-cry\.webp$/)
    expect(imgs[0].getAttribute('loading')).toBe('lazy')
    expect(imgs[0].getAttribute('width')).toBe('88')
    const still = container.querySelector('source')
    expect(still?.getAttribute('media')).toBe('(prefers-reduced-motion: reduce)')
    expect(still?.getAttribute('srcset')).toMatch(/kaodango-dance-still\.png$/)
  })

  it('設定一改,已經 mount 嘅公仔即刻換', () => {
    const { container } = render(<MascotWelcome title="t" sub="s" />)
    expect(container.querySelector('.dango-sticker')).toBeNull()
    act(() => setMascotSet('dango'))
    expect(container.querySelector('img')?.getAttribute('src')).toMatch(/kaodango-wave\.webp$/)
    act(() => setMascotSet('classic'))
    expect(container.querySelector('.dango-sticker')).toBeNull()
  })

  it('素材唔喺度(圖載入失敗):退返原創公仔', () => {
    setMascotSet('dango')
    const { container } = render(<MascotGreeting />)
    const img = container.querySelector('img')!
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelectorAll('svg').length).toBe(2)
  })
})
