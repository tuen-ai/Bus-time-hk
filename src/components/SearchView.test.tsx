import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SearchView from './SearchView'

const favMounts = vi.hoisted(() => ({ n: 0 }))
// 巴士 / 港鐵收藏數量:每個 test 自己設
const counts = vi.hoisted(() => ({ bus: 1, mtr: 0 }))
// 熟客問候嘅天氣:每個 test 自己設(null = 攞唔到)
const wx = vi.hoisted(() => ({ now: null as null | { tempC: number; rainfall: Record<string, number> } }))

// 淨係測首頁幾時出收藏:子組件換做標記,唔使真係攞 ETA / 天氣
vi.mock('../api/bus', () => ({
  coClass: () => '',
  coLabel: (c: string) => c,
  CO_COLOR: { kmb: '#e60012', ctb: '#ffd200', nlb: '#00857c', gmb: '#009a44', lrt: '#d3a809' },
  SEARCH_OPERATORS: ['kmb', 'ctb', 'nlb', 'gmb', 'lrt'],
  missingOperators: () => [],
}))
vi.mock('../lib/store', () => ({
  FAVS_CHANGED: 'kkcx:favs-changed',
  getFavorites: () => Array.from({ length: counts.bus }, () => ({})),
}))
// 首頁用輕量版(唔帶站表);港鐵收藏卡係 lazy chunk
vi.mock('../lib/mtrFavsStore', () => ({
  MTRFAVS_CHANGED: 'kkcx:mtrfavs-changed',
  hasMtrFavs: () => counts.mtr > 0,
}))
vi.mock('../api/weather', () => ({
  getWeather: () =>
    wx.now
      ? Promise.resolve({ humidity: null, warnings: [], updatedAt: 0, ...wx.now })
      : Promise.reject(new Error('offline')),
}))
vi.mock('./MtrFavorites', () => ({
  default: ({ onOpen, onEmpty }: { onOpen: (line: string, sta: string) => void; onEmpty?: () => void }) => (
    <>
      <button type="button" data-testid="mtr-favs" onClick={() => onOpen('TWL', 'TST')} />
      <button type="button" data-testid="mtr-remove-last" onClick={() => onEmpty?.()} />
    </>
  ),
}))
vi.mock('../lib/stamps', () => ({ getStamps: () => [], unlocked: () => [] }))
vi.mock('./Favorites', () => ({
  default: function FavsStub() {
    useEffect(() => void favMounts.n++, [])
    return <div data-testid="favs" />
  },
}))
vi.mock('./SmartSuggest', () => ({ default: () => <div data-testid="suggest" /> }))
vi.mock('./StampCard', () => ({ default: () => <div data-testid="stamps" /> }))
// 新用戶大公仔 hero 會攞天氣:換做標記
vi.mock('./Mascots', async (orig) => ({
  ...(await orig<typeof import('./Mascots')>()),
  MascotWelcome: () => <div data-testid="hero" />,
}))

const base = {
  routes: [],
  error: null,
  onRetry: () => {},
  onOpen: () => {},
  onOpenFavorite: () => {},
  onOpenMtr: () => {},
  onQuery: () => {},
  coFilter: 'all' as const,
  onCoFilter: () => {},
}

describe('SearchView 首頁收藏', () => {
  afterEach(() => {
    cleanup()
    counts.bus = 1
    counts.mtr = 0
    wx.now = null
  })

  it('路線清單載緊(慢網)都照出收藏', () => {
    render(<SearchView {...base} loading query="" />)
    expect(screen.getByTestId('favs')).toBeTruthy()
    expect(screen.queryByTestId('suggest')).toBeNull() // 推薦要用路線清單:等載完先出
  })

  it('路線清單載唔到都照出收藏', () => {
    render(<SearchView {...base} loading={false} error="九巴路線資料載入唔到" query="" />)
    expect(screen.getByTestId('favs')).toBeTruthy()
  })

  it('路線清單載完:收藏照留喺度,唔會重新 mount(ETA 唔使由 skeleton 重頭嚟)', () => {
    favMounts.n = 0
    const { rerender } = render(<SearchView {...base} loading query="" />)
    expect(favMounts.n).toBe(1)
    rerender(<SearchView {...base} loading={false} query="" />)
    expect(screen.getByTestId('favs')).toBeTruthy()
    expect(screen.getByTestId('suggest')).toBeTruthy()
    expect(favMounts.n).toBe(1)
  })

  it('打緊字就收埋收藏', () => {
    render(<SearchView {...base} loading query="1A" />)
    expect(screen.queryByTestId('favs')).toBeNull()
  })

  it('港鐵收藏緊貼巴士收藏(喺推薦之前),撳落去帶埋綫同站', async () => {
    counts.mtr = 1
    const onOpenMtr = vi.fn()
    render(<SearchView {...base} loading={false} query="" onOpenMtr={onOpenMtr} />)
    const favs = screen.getByTestId('favs')
    const mtr = await screen.findByTestId('mtr-favs')
    const suggest = screen.getByTestId('suggest')
    expect(favs.nextElementSibling).toBe(mtr)
    expect(mtr.compareDocumentPosition(suggest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(mtr)
    expect(onOpenMtr).toHaveBeenCalledWith('TWL', 'TST')
  })

  it('淨係有港鐵收藏都當熟客:細問候 + 收藏排最前,唔出大公仔 hero', async () => {
    counts.bus = 0
    counts.mtr = 1
    const { container } = render(<SearchView {...base} loading={false} query="" />)
    expect(container.querySelector('.home-greet')).toBeTruthy()
    expect(screen.queryByTestId('hero')).toBeNull()
    const mtr = await screen.findByTestId('mtr-favs')
    expect(
      mtr.compareDocumentPosition(screen.getByTestId('suggest')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    // 移除咗最後一個港鐵收藏 → 轉返新用戶排法
    counts.mtr = 0
    act(() => void window.dispatchEvent(new Event('kkcx:mtrfavs-changed')))
    expect(container.querySelector('.home-greet')).toBeNull()
    expect(screen.getByTestId('hero')).toBeTruthy()
    expect(screen.queryByTestId('mtr-favs')).toBeNull()
  })

  it('打緊字就收埋港鐵收藏', async () => {
    counts.mtr = 1
    render(<SearchView {...base} loading={false} query="1A" />)
    await act(() => Promise.resolve())
    expect(screen.queryByTestId('mtr-favs')).toBeNull()
  })

  it('冇港鐵收藏:唔載港鐵收藏卡', async () => {
    render(<SearchView {...base} loading={false} query="" />)
    await act(() => Promise.resolve())
    expect(screen.queryByTestId('mtr-favs')).toBeNull()
  })

  it('已經有巴士收藏,先加第一個港鐵收藏:港鐵卡即刻出(唔使重開 app)', async () => {
    render(<SearchView {...base} loading={false} query="" />)
    expect(screen.getByTestId('favs')).toBeTruthy()
    counts.mtr = 1
    act(() => void window.dispatchEvent(new Event('kkcx:mtrfavs-changed')))
    expect(await screen.findByTestId('mtr-favs')).toBeTruthy()
  })
})

describe('SearchView 港鐵收藏移除晒', () => {
  afterEach(() => {
    cleanup()
    counts.mtr = 0
  })

  it('焦點返去搜尋區(唔會跌落 body,亦唔 focus 輸入框彈鍵盤)', async () => {
    counts.mtr = 1
    render(<SearchView {...base} loading={false} query="" />)
    fireEvent.click(await screen.findByTestId('mtr-remove-last'))
    expect(document.activeElement).toBe(screen.getByRole('search'))
  })
})

describe('SearchView 熟客問候', () => {
  afterEach(() => {
    cleanup()
    wx.now = null
  })

  it('落緊雨:細問候都出帶遮提示(唔係淨係新用戶大 hero 先有)', async () => {
    wx.now = { tempC: 26, rainfall: { 油尖旺: 12 } }
    const { container } = render(<SearchView {...base} loading={false} query="" />)
    expect(await screen.findByText(/記得帶遮/)).toBeTruthy()
    expect(container.querySelector('.home-greet .wx-mood')).toBeTruthy()
  })

  it('天氣攞唔到 / 冇特別:淨係問候,唔出提示', async () => {
    const { container } = render(<SearchView {...base} loading={false} query="" />)
    await act(() => Promise.resolve())
    expect(container.querySelector('.home-greet')).toBeTruthy()
    expect(container.querySelector('.wx-mood')).toBeNull()
  })
})
