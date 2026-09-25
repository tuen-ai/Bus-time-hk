import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SearchView from './SearchView'

const favMounts = vi.hoisted(() => ({ n: 0 }))
// 巴士 / 港鐵收藏數量:每個 test 自己設
const counts = vi.hoisted(() => ({ bus: 1, mtr: 0 }))

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
vi.mock('../lib/mtrFavs', () => ({
  MTRFAVS_CHANGED: 'kkcx:mtrfavs-changed',
  getMtrFavs: () => Array.from({ length: counts.mtr }, () => ({})),
}))
vi.mock('./MtrFavorites', () => ({
  default: ({ onOpen }: { onOpen: (line: string, sta: string) => void }) => (
    <button type="button" data-testid="mtr-favs" onClick={() => onOpen('TWL', 'TST')} />
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

  it('港鐵收藏緊貼巴士收藏(喺推薦之前),撳落去帶埋綫同站', () => {
    const onOpenMtr = vi.fn()
    render(<SearchView {...base} loading={false} query="" onOpenMtr={onOpenMtr} />)
    const favs = screen.getByTestId('favs')
    const mtr = screen.getByTestId('mtr-favs')
    const suggest = screen.getByTestId('suggest')
    expect(favs.nextElementSibling).toBe(mtr)
    expect(mtr.compareDocumentPosition(suggest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(mtr)
    expect(onOpenMtr).toHaveBeenCalledWith('TWL', 'TST')
  })

  it('淨係有港鐵收藏都當熟客:細問候 + 收藏排最前,唔出大公仔 hero', () => {
    counts.bus = 0
    counts.mtr = 1
    const { container } = render(<SearchView {...base} loading={false} query="" />)
    expect(container.querySelector('.home-greet')).toBeTruthy()
    expect(screen.queryByTestId('hero')).toBeNull()
    const mtr = screen.getByTestId('mtr-favs')
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

  it('打緊字就收埋港鐵收藏', () => {
    counts.mtr = 1
    render(<SearchView {...base} loading={false} query="1A" />)
    expect(screen.queryByTestId('mtr-favs')).toBeNull()
  })
})
