import { describe, expect, it } from 'vitest'
import { nlbResolve, nlbRouteId, nlbRoutes, nlbRouteStops, nlbUid } from './nlbData'

describe('嶼巴同號變體(route|bound|st 會撞)', () => {
  const all = nlbRoutes()

  it('每條線都有唯一 uid,而且對得返自己', () => {
    expect(new Set(all.map((r) => r.uid)).size).toBe(all.length)
    for (const r of all) expect(nlbUid(nlbResolve(r)!)).toBe(r.uid)
  })

  it('3M 往東涌 / 往梅窩唔會再攞錯站序', () => {
    const v = all.filter((r) => r.route === '3M' && r.bound === 'O' && r.service_type === '1')
    const toTc = v.find((r) => r.orig_tc === '梅窩碼頭')!
    const toMw = v.find((r) => r.dest_tc === '梅窩碼頭')!
    expect(nlbRouteStops(toTc)[0].name).toMatch(/梅窩/)
    expect(nlbRouteStops(toMw)[0].name).not.toMatch(/梅窩/)
  })

  it('冇 uid(舊收藏):目的地 → 經過嘅站 → 第一條', () => {
    const q = { route: '3M', bound: 'O' as const, service_type: '1', dest_tc: '梅窩碼頭' }
    expect(nlbRouteId(q)).toBe('6')
    const toTc = { ...q, dest_tc: '東涌站巴士總站' }
    expect(nlbRouteId(toTc, '1')).toBe('7') // 梅窩碼頭開嗰條先經站 1
    expect(nlbRouteId({ ...toTc, dest_tc: '' })).toBe('8')
  })

  it('舊收藏 bound 已經俾上游反轉 → 兩個方向搵返同目的地嗰條', () => {
    // 上游 2026-09 將回程改做 I:11 st2 往東涌而家係 I
    const r = nlbResolve({ route: '11', bound: 'O', service_type: '2', dest_tc: '東涌站巴士總站' })
    expect(r?.bound).toBe('I')
    expect(r?.dTc.trim()).toBe('東涌站巴士總站')
  })

  it('查唔到 → null / 空站序', () => {
    const q = { route: 'ZZZ', bound: 'O' as const, service_type: '1', dest_tc: '' }
    expect(nlbRouteId(q)).toBeNull()
    expect(nlbRouteStops(q)).toEqual([])
  })
})
