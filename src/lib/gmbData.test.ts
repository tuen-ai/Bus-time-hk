import { describe, expect, it } from 'vitest'
import {
  GMB_SHARDS,
  cmpUid,
  gmbRouteStops,
  gmbRoutesAsync,
  gmbShardOf,
  gmbShardPath,
  type GmbShard,
} from './gmbData'
import gmbRoutes from '../data/gmbRoutes.json'
import shardFrom from '../data/gmbShards.json'

// committed 分片(同 app 一樣經 Vite glob 讀)
const files = import.meta.glob<GmbShard>('../data/gmb-*.json', { import: 'default', eager: true })

describe('cmpUid / gmbShardOf', () => {
  it('數字 uid 按數值排(唔係字典序)', () => {
    expect(cmpUid('999', '1000')).toBeLessThan(0)
    expect(cmpUid('2000410', '2000410')).toBe(0)
    expect(cmpUid('2011721', '2000410')).toBeGreaterThan(0)
  })

  it('界線:細過第一條 → 0;等於界線 → 嗰份開始;大過最後 → 最尾一份', () => {
    const from = ['200', '500']
    expect(gmbShardOf('100', from)).toBe(0)
    expect(gmbShardOf('199', from)).toBe(0)
    expect(gmbShardOf('200', from)).toBe(1)
    expect(gmbShardOf('499', from)).toBe(1)
    expect(gmbShardOf('500', from)).toBe(2)
    expect(gmbShardOf('1000', from)).toBe(2) // 長啲 = 大啲
    expect(gmbShardOf('x', [])).toBe(0)
  })

  it('committed 界線:遞增、每份都有線、分得平均', () => {
    expect(GMB_SHARDS).toBe(shardFrom.length + 1)
    for (let i = 1; i < shardFrom.length; i++) expect(cmpUid(shardFrom[i - 1], shardFrom[i])).toBeLessThan(0)
    const counts = new Array<number>(GMB_SHARDS).fill(0)
    for (const r of gmbRoutes) counts[gmbShardOf(r.uid)]++
    expect(counts.every((c) => c > 0)).toBe(true)
    expect(Math.max(...counts)).toBeLessThan((gmbRoutes.length / GMB_SHARDS) * 2)
  })
})

describe('committed 綠van 分片(scripts/bake-static.mjs 出)', () => {
  it('份數同界線一致;每條線喺 gmbShardOf 指嗰份;站都齊', () => {
    expect(Object.keys(files).sort()).toEqual(
      Array.from({ length: GMB_SHARDS }, (_, n) => gmbShardPath(n)).sort(),
    )
    for (let n = 0; n < GMB_SHARDS; n++) {
      const sh = files[gmbShardPath(n)]
      for (const [k, stops] of Object.entries(sh.r)) {
        expect(gmbShardOf(k.slice(0, k.lastIndexOf('|'))), k).toBe(n)
        expect(
          stops.every((id) => id in sh.s),
          k,
        ).toBe(true)
      }
    }
  })

  it('同 gmbRoutes.json 一一對應(uid|bound)', () => {
    const inShards = new Set(Object.values(files).flatMap((sh) => Object.keys(sh.r)))
    const inList = new Set(gmbRoutes.map((r) => `${r.uid}|${r.bound}`))
    expect(inShards).toEqual(inList)
  })
})

describe('gmbRouteStops', () => {
  // 同一個 uid 去程回程站序唔同:以前淨係用 uid 搵,回程會顯示咗去程嘅站
  const shared = gmbRoutes.find(
    (r) => r.bound === 'I' && gmbRoutes.some((x) => x.uid === r.uid && x.bound === 'O'),
  )!

  it('按 uid + bound 攞站序,有站名座標', async () => {
    const out = await gmbRouteStops(shared.uid, 'O')
    const back = await gmbRouteStops(shared.uid, 'I')
    expect(out.length).toBeGreaterThan(1)
    expect(back.length).toBeGreaterThan(1)
    expect(back.map((s) => s.stopId)).not.toEqual(out.map((s) => s.stopId))
    expect(out[0]).toMatchObject({ seq: 1 })
    expect(out[0].name).not.toBe(out[0].stopId)
    expect(out[0].lat).toBeGreaterThan(22)
    expect(out[0].lng).toBeGreaterThan(113)
  })

  it('冇 bound(舊 caller)→ 先去程;唔識嘅 uid → 空', async () => {
    expect(await gmbRouteStops(shared.uid)).toEqual(await gmbRouteStops(shared.uid, 'O'))
    expect(await gmbRouteStops('nope', 'O')).toEqual([])
  })

  it('路線清單照舊', async () => {
    const list = await gmbRoutesAsync()
    expect(list).toHaveLength(gmbRoutes.length)
    expect(list[0]).toMatchObject({ co: 'gmb', uid: gmbRoutes[0].uid })
  })
})
