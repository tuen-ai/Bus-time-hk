import { cleanup, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SearchView from './SearchView'

const favMounts = vi.hoisted(() => ({ n: 0 }))

// 淨係測首頁幾時出收藏:子組件換做標記,唔使真係攞 ETA / 天氣
vi.mock('../api/bus', () => ({
  coClass: () => '',
  coLabel: (c: string) => c,
  CO_COLOR: { kmb: '#e60012', ctb: '#ffd200', nlb: '#00857c', gmb: '#009a44', lrt: '#d3a809' },
  SEARCH_OPERATORS: ['kmb', 'ctb', 'nlb', 'gmb', 'lrt'],
  missingOperators: () => [],
}))
vi.mock('../lib/store', () => ({ FAVS_CHANGED: 'kkcx:favs-changed', getFavorites: () => [{}] }))
vi.mock('../lib/stamps', () => ({ getStamps: () => [], unlocked: () => [] }))
vi.mock('./Favorites', () => ({
  default: function FavsStub() {
    useEffect(() => void favMounts.n++, [])
    return <div data-testid="favs" />
  },
}))
vi.mock('./SmartSuggest', () => ({ default: () => <div data-testid="suggest" /> }))
vi.mock('./StampCard', () => ({ default: () => <div data-testid="stamps" /> }))

const base = {
  routes: [],
  error: null,
  onRetry: () => {},
  onOpen: () => {},
  onOpenFavorite: () => {},
  onQuery: () => {},
  coFilter: 'all' as const,
  onCoFilter: () => {},
}

describe('SearchView 首頁收藏', () => {
  afterEach(cleanup)

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
})
