import { describe, expect, it, vi } from 'vitest'
import { fetchGmbEta, fetchGmbStopAll } from './gmb'

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
    expect(await fetchGmbStopAll('s3')).toEqual([{ routeCode: '11M', routeSeq: 1, minsList: [3] }])
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('stop-route 404 = 真係冇路線:回 [] 兼記住,唔再問', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, 404))
    expect(await fetchGmbStopAll('s4')).toEqual([])
    expect(await fetchGmbEta('s4', '11M', 'O')).toEqual([])
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
