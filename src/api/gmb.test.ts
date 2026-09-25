import { describe, expect, it, vi } from 'vitest'
import { fetchGmbEta, fetchGmbStopAll, matchStopRoute, type StopRouteEntry } from './gmb'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const SR = { data: [{ route_id: 9, route_seq: 1, route_code: '11M' }] }
const ETA = {
  data: [
    { route_id: 9, route_seq: 1, eta: [{ eta_seq: 1, diff: 3, timestamp: '2026-01-01T10:03:00+08:00' }] },
  ],
}

describe('GMB', () => {
  it('stop-route 一時失敗唔會記死做「冇路線」', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch')) // stop-route 斷線
      .mockResolvedValueOnce(json(SR))
      .mockResolvedValueOnce(json(ETA))
    await expect(fetchGmbEta('s1', '11M', 'O')).rejects.toBeInstanceOf(TypeError)
    const etas = await fetchGmbEta('s1', '11M', 'O')
    expect(etas).toHaveLength(1)
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('/eta/stop 失敗會拋錯(唔好扮「暫無預計班次」)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(SR)).mockResolvedValueOnce(json('x', 503))
    await expect(fetchGmbEta('s2', '11M', 'O')).rejects.toMatchObject({ status: 503 })
  })

  it('附近 tab:站失敗照拋(nearby 用 allSettled 分辨「斷網」同「冇車」),下一轉會重新攞 stop-route', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(SR))
      .mockResolvedValueOnce(json(ETA))
    await expect(fetchGmbStopAll('s3')).rejects.toBeInstanceOf(TypeError)
    expect(await fetchGmbStopAll('s3')).toEqual([
      { routeCode: '11M', routeSeq: 1, routeId: '9', minsList: [3] },
    ])
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('stop-route 404 = 真係冇路線:回 [] 兼記住,唔再問', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, 404))
    expect(await fetchGmbStopAll('s4')).toEqual([])
    expect(await fetchGmbEta('s4', '11M', 'O')).toEqual([])
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('GMB:用 routeId(= app uid)分同號線', () => {
  // 同一個站:101M 兩條唔同線(route_id 1 / 2),route_id 1 淨係經過去程;另一條 101M 只有回程
  const SR2: StopRouteEntry[] = [
    { route_id: 1, route_seq: 1, route_code: '101M' },
    { route_id: 2, route_seq: 2, route_code: '101M' },
    { route_id: '3', route_seq: 1, route_code: '11' },
  ]

  it('有 routeId 對到就只信佢;方向唔啱回 undefined,唔好跳去對面方向', () => {
    expect(matchStopRoute(SR2, '101M', 'I', '2')).toBe(SR2[1])
    expect(matchStopRoute(SR2, '101M', 'O', '1')).toBe(SR2[0])
    expect(matchStopRoute(SR2, '101M', 'I', '1')).toBeUndefined()
    expect(matchStopRoute(SR2, '11', 'O', '3')).toBe(SR2[2]) // route_id 係字串都得
  })

  it('冇 routeId / routeId 唔喺呢個站 → 照舊用 route 號(方向唔啱先退返同號)', () => {
    expect(matchStopRoute(SR2, '101M', 'I')).toBe(SR2[1])
    expect(matchStopRoute(SR2, '11', 'I')).toBe(SR2[2])
    expect(matchStopRoute(SR2, '101M', 'O', '999')).toBe(SR2[0])
    expect(matchStopRoute(SR2, '2', 'O')).toBeUndefined()
  })

  it('fetchGmbEta 傳 routeId → 只攞嗰條線嘅班次', async () => {
    const eta = (id: number, seq: number, diff: number) => ({
      route_id: id,
      route_seq: seq,
      eta: [{ eta_seq: 1, diff, timestamp: `2026-01-01T10:0${diff}:00+08:00` }],
    })
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ data: SR2 }))
      .mockResolvedValueOnce(json({ data: [eta(1, 1, 3), eta(2, 2, 7)] }))
    const out = await fetchGmbEta('s5', '101M', 'I', '2')
    expect(out.map((e) => e.eta)).toEqual(['2026-01-01T10:07:00+08:00'])
    expect(out[0]).toMatchObject({ co: 'gmb', route: '101M', dir: 'I' })
  })

  it('routeId 喺呢個站冇呢個方向 → 空,唔使問 /eta/stop', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ data: SR2 }))
    expect(await fetchGmbEta('s6', '101M', 'I', '1')).toEqual([])
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
