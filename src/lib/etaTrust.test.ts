import { describe, expect, it } from 'vitest'
import { etaTrust } from './etaTrust'

describe('etaTrust', () => {
  it('冇備註 = 實時,唔加標籤', () => {
    expect(etaTrust('')).toEqual({ tags: [], rest: '' })
    expect(etaTrust(null)).toEqual({ tags: [], rest: '' })
    expect(etaTrust('  ')).toEqual({ tags: [], rest: '' })
  })

  it('九巴 原定班次 / 城巴 預定班次 / 非實時班次 → 預定', () => {
    expect(etaTrust('原定班次')).toEqual({ tags: ['sched'], rest: '' })
    expect(etaTrust('預定班次')).toEqual({ tags: ['sched'], rest: '' })
    expect(etaTrust('非實時班次')).toEqual({ tags: ['sched'], rest: '' })
  })

  it('最後班次 / 尾班車 / 尾班 → 尾班車', () => {
    expect(etaTrust('最後班次')).toEqual({ tags: ['last'], rest: '' })
    expect(etaTrust('尾班車')).toEqual({ tags: ['last'], rest: '' })
    expect(etaTrust('尾班')).toEqual({ tags: ['last'], rest: '' })
  })

  it('兩樣都有 → 兩個標籤,唔剩分隔符', () => {
    expect(etaTrust('原定班次, 最後班次')).toEqual({ tags: ['sched', 'last'], rest: '' })
    expect(etaTrust('最後班次、預定班次')).toEqual({ tags: ['sched', 'last'], rest: '' })
  })

  it('認唔到嘅備註照原文(月台、已開出、聯營)', () => {
    expect(etaTrust('月台 1')).toEqual({ tags: [], rest: '月台 1' })
    expect(etaTrust('已開出')).toEqual({ tags: [], rest: '已開出' })
    expect(etaTrust('九巴與城巴聯營路線')).toEqual({ tags: [], rest: '九巴與城巴聯營路線' })
  })

  it('標籤以外嘅字留低', () => {
    expect(etaTrust('原定班次(繞經機場)')).toEqual({ tags: ['sched'], rest: '繞經機場' })
    expect(etaTrust('最後班次 經西隧')).toEqual({ tags: ['last'], rest: '經西隧' })
  })
})
