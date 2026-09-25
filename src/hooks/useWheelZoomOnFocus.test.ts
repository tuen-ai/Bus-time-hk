import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useWheelZoomOnFocus } from './useWheelZoomOnFocus'

// 假 map:記低 on/off 嘅 handler,可以手動 fire focus / blur
const { handlers, map } = vi.hoisted(() => {
  const handlers = new Map<string, () => void>()
  const map = {
    on: vi.fn((ev: string, fn: () => void) => handlers.set(ev, fn)),
    off: vi.fn((ev: string) => handlers.delete(ev)),
    scrollWheelZoom: { enable: vi.fn(), disable: vi.fn() },
  }
  return { handlers, map }
})
vi.mock('react-leaflet', () => ({ useMap: () => map }))

describe('useWheelZoomOnFocus', () => {
  it('focus 先開滾輪縮放,blur 還返畀頁面;unmount 會解除', () => {
    const { unmount } = renderHook(() => useWheelZoomOnFocus())
    expect(map.scrollWheelZoom.enable).not.toHaveBeenCalled()
    handlers.get('focus')!()
    expect(map.scrollWheelZoom.enable).toHaveBeenCalledTimes(1)
    handlers.get('blur')!()
    expect(map.scrollWheelZoom.disable).toHaveBeenCalledTimes(1)
    unmount()
    expect(map.off).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(map.off).toHaveBeenCalledWith('blur', expect.any(Function))
    expect(handlers.size).toBe(0)
  })
})
