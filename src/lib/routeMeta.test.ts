import { describe, expect, it } from 'vitest'
import { routeBadges } from './routeMeta'

describe('routeBadges', () => {
  it('夜車 / 特別班', () => {
    expect(routeBadges('N170', '1')).toEqual([{ label: '夜', kind: 'night' }])
    expect(routeBadges('1A', '2')).toEqual([{ label: '特別班', kind: 'special' }])
    expect(routeBadges('1A', '1')).toEqual([])
    expect(routeBadges('1A', '')).toEqual([])
  })

  it("輕鐵 '*' 都當特別班(唔會重複)", () => {
    expect(routeBadges('751*', '1')).toEqual([{ label: '特別班', kind: 'special' }])
    expect(routeBadges('751*', '2')).toEqual([{ label: '特別班', kind: 'special' }])
    expect(routeBadges('751', '1')).toEqual([])
  })
})
