import { describe, expect, it } from 'vitest'
import { coClass, coLabel, routeKey, routeKeyOf, type Route } from './bus'

describe('bus helpers', () => {
  it('coLabel / coClass', () => {
    expect(coLabel('kmb')).toBe('九巴')
    expect(coLabel('gmb')).toBe('綠van')
    expect(coClass('kmb')).toBe('') // 九巴用預設粉紅
    expect(coClass('ctb')).toBe('co-ctb')
  })

  it('routeKey 同 routeKeyOf 一致(收藏 / 推薦 / 規劃 leg 對返 Route)', () => {
    const r: Route = { co: 'ctb', route: '1', bound: 'I', service_type: '1', orig_tc: 'a', dest_tc: 'b' }
    expect(routeKeyOf(r)).toBe('ctb|1|I|1')
    expect(routeKey({ co: 'ctb', route: '1', bound: 'I', serviceType: '1' })).toBe(routeKeyOf(r))
  })
})
