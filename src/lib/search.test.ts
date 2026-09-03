import { describe, expect, it } from 'vitest'
import { searchRoutes } from './search'
import type { Route } from '../api/bus'

const r = (co: Route['co'], route: string, dest: string, orig = '起點', st = '1'): Route => ({
  co,
  route,
  bound: 'O',
  service_type: st,
  orig_tc: orig,
  dest_tc: dest,
})

const routes: Route[] = [
  r('kmb', '1', '尖沙咀碼頭', '竹園邨'),
  r('kmb', '1A', '尖沙咀碼頭', '中秀茂坪'),
  r('kmb', '11', '九龍站', '鑽石山'),
  r('ctb', '1', '跑馬地', '摩星嶺'),
  r('gmb', '1', '山頂', '中環'),
  r('kmb', 'N1', '機場', '尖沙咀'),
]

describe('searchRoutes', () => {
  it('空 query → 空', () => {
    expect(searchRoutes(routes, '  ')).toEqual([])
  })

  it('路線號 prefix,唔分大細楷,數字自然排序', () => {
    expect(searchRoutes(routes, '1').map((x) => `${x.co}|${x.route}`)).toEqual([
      'ctb|1',
      'gmb|1',
      'kmb|1',
      'kmb|1A',
      'kmb|11',
    ])
    expect(searchRoutes(routes, 'n1').map((x) => x.route)).toEqual(['N1'])
  })

  it('有中文 → 搵目的地或起點', () => {
    expect(searchRoutes(routes, '尖沙咀').map((x) => x.route)).toEqual(['1', '1A', 'N1'])
    expect(searchRoutes(routes, '中環').map((x) => `${x.co}|${x.route}`)).toEqual(['gmb|1'])
  })

  it('營辦商 filter', () => {
    expect(searchRoutes(routes, '1', 'ctb').map((x) => x.co)).toEqual(['ctb'])
    expect(searchRoutes(routes, '尖沙咀', 'gmb')).toEqual([])
  })
})
