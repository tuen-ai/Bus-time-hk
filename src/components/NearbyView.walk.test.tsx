import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import NearbyView from './NearbyView'
import { getPosition } from '../lib/geo'
import { nearbyBuses, type NearbyRow } from '../lib/nearby'

// 附近:由站距離自動估步行,趕唔切嘅分鐘數淡 + 刪除線,之後第一班趕到嘅標 🚶
vi.mock('../lib/geo', async (orig) => ({
  ...(await orig<typeof import('../lib/geo')>()),
  getPosition: vi.fn(),
}))
vi.mock('../lib/nearby', async (orig) => ({
  ...(await orig<typeof import('../lib/nearby')>()),
  nearbyBuses: vi.fn(),
}))
vi.mock('../api/bus', () => ({
  CO_COLOR: { kmb: '#c8102e', ctb: '#0e7490', gmb: '#167a3a' },
  coLabel: (co: string) => ({ kmb: '九巴', ctb: '城巴', gmb: '綠van' })[co] ?? co,
  coClass: (co: string) => (co === 'kmb' ? '' : `co-${co}`),
}))
vi.mock('../api/kmb', () => ({ fetchStopEta: vi.fn() }))
vi.mock('../api/ctb', () => ({ fetchCtbEta: vi.fn() }))
vi.mock('../api/gmb', () => ({ fetchGmbStopAll: vi.fn() }))
vi.mock('../lib/store', () => ({ getStopMap: vi.fn() }))
vi.mock('../lib/planGraph', () => ({ loadGraph: vi.fn(), nearStops: vi.fn() }))

const row = (route: string, dest: string, dist: number, mins: number[]): NearbyRow => ({
  co: 'kmb',
  route,
  dir: 'O',
  serviceType: '1',
  dest,
  stopId: 'S',
  stopName: '彌敦道',
  dist,
  mins,
})
const pos = { coords: { latitude: 22.3, longitude: 114.1 } } as GeolocationPosition

afterEach(() => {
  cleanup()
  localStorage.clear()
})

async function renderRows(rows: NearbyRow[]) {
  vi.mocked(getPosition).mockResolvedValue(pos)
  vi.mocked(nearbyBuses).mockResolvedValue(rows)
  render(<NearbyView onOpen={() => {}} onPlanTo={() => {}} />)
  await screen.findByText(`往 ${rows[0].dest}`)
}
const rowBtn = (dest: string) => screen.getByText(`往 ${dest}`).closest('.nearby-row') as HTMLElement

describe('NearbyView 🚶 步行估算', () => {
  it('距離旁邊顯示「🚶約N分」(直線 × 1.25 ÷ 80 米/分,向上取整)', async () => {
    await renderRows([row('1', '尖沙咀', 80, [5]), row('2', '旺角', 400, [9])])
    expect(rowBtn('尖沙咀').querySelector('.nearby-walk')?.textContent).toBe('🚶步行約2分')
    expect(rowBtn('旺角').querySelector('.nearby-walk')?.textContent).toBe('🚶步行約7分')
  })

  it('「·」喺 nowrap 外面:斷行唔會拖住個點落下一行', async () => {
    await renderRows([row('1', '尖沙咀', 80, [5])])
    const walk = rowBtn('尖沙咀').querySelector('.nearby-walk') as HTMLElement
    expect(walk.textContent?.startsWith('·')).toBe(false)
    // NBSP 喺「·」前面:只可以喺「·」後面斷行
    expect(walk.parentElement?.textContent).toBe('彌敦道\u00a0· 80 米\u00a0· 🚶步行約2分')
  })

  it('第一班趕唔切:淡 + 讀屏講「趕唔切」;之後第一班趕到嘅標 🚶', async () => {
    // 80 米 → 約 2 分 + 1 分預留:1 分鐘嗰班趕唔切,5 分鐘嗰班趕到
    await renderRows([row('1', '尖沙咀', 80, [1, 5, 9])])
    const r = rowBtn('尖沙咀')
    const first = r.querySelector('.nearby-min') as HTMLElement
    expect(first.className).toContain('missed')
    expect(first.className).not.toContain('soon')
    expect(first.textContent).toBe('1分(趕唔切)')
    const pick = r.querySelector('.nearby-next .catch') as HTMLElement
    expect(pick.textContent).toBe('🚶5分(應該趕到)')
    expect(r.querySelector('.nearby-next')?.textContent).toBe('🚶5分(應該趕到), 9分')
  })

  it('第一班已經趕到:照舊(就到橙色),唔會多標嘢', async () => {
    await renderRows([row('1', '尖沙咀', 80, [3, 8])])
    const r = rowBtn('尖沙咀')
    const first = r.querySelector('.nearby-min') as HTMLElement
    expect(first.className).toContain('soon')
    expect(first.className).not.toContain('missed')
    expect(r.querySelector('.missed, .catch')).toBeNull()
    expect(r.querySelector('.nearby-next')?.textContent).toBe('8分')
  })

  it('全部趕唔切:逐班刪除線,冇 🚶 標記', async () => {
    await renderRows([row('1', '尖沙咀', 400, [0, 4, 7])])
    const r = rowBtn('尖沙咀')
    expect(r.querySelectorAll('.missed')).toHaveLength(3)
    expect(r.querySelector('.catch')).toBeNull()
  })

  it('企喺站(GPS 誤差 30 米):「即將」嗰班照舊橙色,唔會劃咗做趕唔切', async () => {
    await renderRows([row('1', '尖沙咀', 30, [0, 4]), row('2', '旺角', 60, [1, 6])])
    for (const dest of ['尖沙咀', '旺角']) {
      const r = rowBtn(dest)
      expect(r.querySelector('.nearby-walk')).toBeNull()
      expect(r.querySelector('.missed, .catch')).toBeNull()
      expect((r.querySelector('.nearby-min') as HTMLElement).className).toContain('soon')
    }
  })

  it('估唔到步行(距離 0):唔顯示 🚶,亦唔標趕唔切', async () => {
    await renderRows([row('1', '尖沙咀', 0, [0, 4])])
    const r = rowBtn('尖沙咀')
    expect(r.querySelector('.nearby-walk')).toBeNull()
    expect(r.querySelector('.missed, .catch')).toBeNull()
    expect((r.querySelector('.nearby-min') as HTMLElement).className).toContain('soon')
  })
})
