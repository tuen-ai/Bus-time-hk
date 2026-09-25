import { afterEach, describe, expect, it, vi } from 'vitest'
import { FAVS_CHANGED, favKey, getFavorites, setFavoriteWalk, toggleFavorite, type Favorite } from './store'

// 收藏步行時間:原地改(次序 / uid 唔郁)+ 通知首頁重讀
const fav = (route: string, stopId: string, extra: Partial<Favorite> = {}): Favorite => ({
  co: 'kmb',
  route,
  bound: 'O',
  serviceType: '1',
  stopId,
  stopName: `站${stopId}`,
  dest: '中環',
  ...extra,
})
const save = (list: Favorite[]) => localStorage.setItem('kmb.favorites', JSON.stringify(list))

afterEach(() => {
  localStorage.clear()
})

describe('setFavoriteWalk', () => {
  it('原地設定:次序唔變、uid 照留,寫返 localStorage + 通知 FAVS_CHANGED', () => {
    const a = fav('1A', 'A')
    const b = fav('969', 'B', { co: 'gmb', uid: 'g-123' })
    const c = fav('2', 'C')
    save([a, b, c])
    const onChange = vi.fn()
    window.addEventListener(FAVS_CHANGED, onChange)
    try {
      const out = setFavoriteWalk(favKey(b), 8)
      expect(out.map((f) => f.route)).toEqual(['1A', '969', '2'])
      expect(out[1]).toEqual({ ...b, walkMins: 8 })
      expect(getFavorites()).toEqual(out)
      expect(onChange).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener(FAVS_CHANGED, onChange)
    }
  })

  it('null / 0 清除;超過 30 當 30;小數四捨五入', () => {
    save([fav('1A', 'A', { walkMins: 5 })])
    const k = favKey(fav('1A', 'A'))
    expect(setFavoriteWalk(k, 45)[0].walkMins).toBe(30)
    expect(setFavoriteWalk(k, 6.6)[0].walkMins).toBe(7)
    expect('walkMins' in setFavoriteWalk(k, null)[0]).toBe(false)
    setFavoriteWalk(k, 3)
    expect('walkMins' in setFavoriteWalk(k, 0)[0]).toBe(false)
    expect(localStorage.getItem('kmb.favorites')).not.toContain('walkMins')
  })

  it('搵唔到個收藏:原封不動,唔寫唔通知', () => {
    save([fav('1A', 'A')])
    const before = localStorage.getItem('kmb.favorites')
    const onChange = vi.fn()
    window.addEventListener(FAVS_CHANGED, onChange)
    try {
      expect(setFavoriteWalk('kmb|X|O|1|Z', 5)).toHaveLength(1)
      expect(localStorage.getItem('kmb.favorites')).toBe(before)
      expect(onChange).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener(FAVS_CHANGED, onChange)
    }
  })

  it('其他收藏操作唔會掉咗步行時間', () => {
    save([fav('1A', 'A', { walkMins: 5 }), fav('2', 'B')])
    const list = toggleFavorite(fav('2', 'B'))
    expect(list).toEqual([fav('1A', 'A', { walkMins: 5 })])
  })
})
