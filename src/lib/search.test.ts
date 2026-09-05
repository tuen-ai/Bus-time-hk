import { describe, expect, it } from 'vitest'
import { parseQuery, searchRoutes } from './search'
import type { Route } from '../api/bus'

const r = (co: Route['co'], route: string, dest: string, orig = '起點', st = '1'): Route => ({
  co,
  route,
  bound: 'O',
  service_type: st,
  orig_tc: orig,
  dest_tc: dest,
})

// 38 同 42C 現實上幾間營辦商都有 —— 正正係用戶搵唔到九巴嗰兩條線嘅原因
const routes: Route[] = [
  r('ctb', '38', '置富花園', '北角碼頭'),
  r('gmb', '38', '元朗(福康街)', '攸潭尾西'),
  r('nlb', '38', '東涌站', '逸東邨'),
  r('kmb', '38', '平田', '葵盛(東)'),
  r('kmb', '38A', '荃灣(海濱花園)', '美孚'),
  r('ctb', '42C', '數碼港', '北角碼頭'),
  r('kmb', '42C', '藍田站', '青衣(長亨邨)'),
  r('kmb', '1', '尖沙咀碼頭', '竹園邨'),
  r('ctb', '1', '跑馬地(上)', '摩星嶺'),
  r('kmb', 'N1', '機場', '尖沙咀'),
  r('ctb', '65', '香港中央圖書館, 高士威道', '數碼港'),
]

const ids = (rs: Route[]) => rs.map((x) => `${x.co}|${x.route}`)

describe('searchRoutes 排序', () => {
  it('同一路線號:九巴排第一,唔會被城巴 / 綠van 迫走(38 嘅 bug)', () => {
    expect(ids(searchRoutes(routes, '38'))).toEqual(['kmb|38', 'ctb|38', 'nlb|38', 'gmb|38', 'kmb|38A'])
  })

  it('42C:九巴排第一', () => {
    expect(ids(searchRoutes(routes, '42C'))).toEqual(['kmb|42C', 'ctb|42C'])
  })

  it('完全相符嘅路線號永遠排喺較長嘅前面', () => {
    const out = ids(searchRoutes(routes, '38'))
    expect(out.indexOf('kmb|38A')).toBeGreaterThan(out.indexOf('ctb|38'))
  })
})

describe('parseQuery', () => {
  it('抽營辦商前綴 + 去「號 / 線」尾綴', () => {
    expect(parseQuery('九巴38號')).toEqual({ text: '38', co: 'kmb' })
    expect(parseQuery('城巴 1')).toEqual({ text: '1', co: 'ctb' })
    expect(parseQuery('綠van 38')).toEqual({ text: '38', co: 'gmb' })
    expect(parseQuery('42C線')).toEqual({ text: '42C', co: null })
  })

  it('全形英數轉半形、去空格、大楷化', () => {
    expect(parseQuery('４２ｃ').text).toBe('42C')
    expect(parseQuery(' 42 c ').text).toBe('42C')
  })
})

describe('searchRoutes 查詢字', () => {
  it('「九巴38」直接淨返九巴', () => {
    expect(ids(searchRoutes(routes, '九巴38'))).toEqual(['kmb|38', 'kmb|38A'])
  })

  it('全形 / 有空格照樣搵到', () => {
    expect(ids(searchRoutes(routes, '４２Ｃ'))).toEqual(['kmb|42C', 'ctb|42C'])
    expect(ids(searchRoutes(routes, '42 c'))).toEqual(['kmb|42C', 'ctb|42C'])
  })

  it('淨係打營辦商 → 列晒佢嘅路線', () => {
    expect(ids(searchRoutes(routes, '嶼巴'))).toEqual(['nlb|38'])
  })

  it('空 query → 空', () => {
    expect(searchRoutes(routes, '  ')).toEqual([])
  })

  it('中文搵目的地 / 起點,站名有空格都夾到', () => {
    expect(ids(searchRoutes(routes, '尖沙咀'))).toEqual(['kmb|1', 'kmb|N1'])
    expect(ids(searchRoutes(routes, '圖書館,高士威道'))).toEqual(['ctb|65'])
  })

  it('營辦商 chip 照樣有效', () => {
    expect(ids(searchRoutes(routes, '38', 'ctb'))).toEqual(['ctb|38'])
    // 查詢字講明嘅營辦商蓋過 chip
    expect(ids(searchRoutes(routes, '九巴38', 'ctb'))).toEqual(['kmb|38', 'kmb|38A'])
  })
})
