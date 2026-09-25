import { afterEach, describe, expect, it } from 'vitest'
import {
  favKey,
  getFavorites,
  isFavorite,
  sameFav,
  setFavoriteWalk,
  toggleFavorite,
  type Favorite,
} from './store'

// 收藏身份:同號綠van / 嶼巴變體(uid 唔同)共用站都分得開;舊收藏(冇 uid)照對到
const gmb = (uid: string | undefined, stopId = 'S1', extra: Partial<Favorite> = {}): Favorite => ({
  co: 'gmb',
  route: '101M',
  bound: 'O',
  serviceType: '2',
  stopId,
  stopName: `站${stopId}`,
  dest: '坑口',
  ...(uid ? { uid } : {}),
  ...extra,
})
const save = (list: Favorite[]) => localStorage.setItem('kmb.favorites', JSON.stringify(list))

afterEach(() => {
  localStorage.clear()
})

describe('favKey / sameFav', () => {
  it('冇 uid:key 同以前一字不差(已存嘅 key 唔會變)', () => {
    expect(favKey(gmb(undefined))).toBe('gmb|101M|O|2|S1')
    expect(favKey({ co: 'kmb', route: '1A', bound: 'I', serviceType: '1', stopId: 'X' })).toBe('kmb|1A|I|1|X')
  })

  it('有 uid:入 key,同站兩個變體唔撞', () => {
    expect(favKey(gmb('2005451'))).toBe('gmb|101M|O|2|S1|2005451')
    expect(favKey(gmb('2005451'))).not.toBe(favKey(gmb('2005453')))
  })

  it('sameFav:uid 唔同 = 唔同收藏;任何一邊冇 uid(舊收藏)= 同一個', () => {
    expect(sameFav(gmb('A'), gmb('A'))).toBe(true)
    expect(sameFav(gmb('A'), gmb('B'))).toBe(false)
    expect(sameFav(gmb(undefined), gmb('B'))).toBe(true)
    expect(sameFav(gmb('A'), gmb(undefined))).toBe(true)
    expect(sameFav(gmb('A', 'S1'), gmb('A', 'S2'))).toBe(false)
  })
})

describe('toggleFavorite / isFavorite 分變體', () => {
  it('變體 A 收藏咗,變體 B 同一個站唔會亮星;撳 B 係加,唔會刪咗 A', () => {
    save([gmb('A')])
    expect(isFavorite(gmb('A'))).toBe(true)
    expect(isFavorite(gmb('B'))).toBe(false)
    const out = toggleFavorite(gmb('B'))
    expect(out.map((f) => f.uid)).toEqual(['B', 'A'])
    // 再撳 B 淨係刪 B
    expect(toggleFavorite(gmb('B')).map((f) => f.uid)).toEqual(['A'])
  })

  it('舊收藏(冇 uid)照亮星,撳就刪返佢(唔會多咗一個)', () => {
    save([gmb(undefined)])
    expect(isFavorite(gmb('A'))).toBe(true)
    expect(toggleFavorite(gmb('A'))).toEqual([])
  })

  it('清單同時有舊收藏同 uid 收藏:刪 uid 嗰個唔會誤刪舊嗰個', () => {
    const legacy = gmb(undefined, 'S1', { dest: '寶林' })
    save([legacy, gmb('B')])
    expect(toggleFavorite(gmb('B'))).toEqual([legacy])
    expect(getFavorites()).toEqual([legacy])
  })

  it('setFavoriteWalk 用 favKey:同站兩個變體各自設', () => {
    save([gmb('A'), gmb('B')])
    const out = setFavoriteWalk(favKey(gmb('B')), 6)
    expect(out.map((f) => f.walkMins)).toEqual([undefined, 6])
  })
})
