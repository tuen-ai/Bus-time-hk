// GMB 綠色專線小巴 靜態資料,全部動態 import lazy load:
// - gmbRoutes.json:1149 條線清單(細,搜尋用)
// - gmb-NN.json:站序 + 站名座標,按 uid 範圍分 GMB_SHARDS 份 → 開一條線只載一份(~12KB gzip)
// - gmbShards.json:分片界線(幾十 byte,靜態 import)
// 載入失敗唔記住,下次再試。
import type { Route, RouteStopInfo } from '../api/bus'
import { memoAsync } from './cache'
import shardFrom from '../data/gmbShards.json'

interface SmallRoute {
  route: string
  uid: string
  bound: 'I' | 'O'
  st: string
  oTc: string
  dTc: string
}

/** 一份分片:`${uid}|${bound}` → 站序;stopId → [lat, lng, 站名] */
export interface GmbShard {
  r: Record<string, string[]>
  s: Record<string, [number, number, string]>
}

/**
 * 分片界線(scripts/bake-static.mjs 出):第 n+1 份由 SHARD_FROM[n] 呢個 uid 開始。
 * 按 uid 範圍分唔用 hash:相鄰 gtfsId 多數同區、共用站,重複站少好多
 * (16 份 hash 分全部加埋 ~285KB gzip,範圍分 ~187KB;SW 會預載晒全部分片)。
 */
const SHARD_FROM: readonly string[] = shardFrom
export const GMB_SHARDS = SHARD_FROM.length + 1

/** uid 次序(要同 bake 一致):先比長度 → 純數字 uid 即係按數值;其他字串都有固定次序 */
export const cmpUid = (a: string, b: string): number => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)

/** uid → 分片號(from 預設 committed 界線;test 可以傳自己嘅) */
export function gmbShardOf(uid: string, from: readonly string[] = SHARD_FROM): number {
  let n = 0
  while (n < from.length && cmpUid(from[n], uid) <= 0) n++
  return n
}

export const gmbShardPath = (n: number): string => `../data/gmb-${String(n).padStart(2, '0')}.json`

// Vite 每份 JSON 切做獨立 chunk,用到先載
const shardFiles = import.meta.glob<GmbShard>('../data/gmb-*.json', { import: 'default' })
const shardLoads = new Map<number, () => Promise<GmbShard>>()

function loadShard(n: number): Promise<GmbShard> {
  let load = shardLoads.get(n)
  if (!load) {
    const file = shardFiles[gmbShardPath(n)]
    if (!file) return Promise.reject(new Error(`缺咗綠van 分片 ${n}`))
    load = memoAsync(file, Infinity)
    shardLoads.set(n, load)
  }
  return load()
}

const loadRoutes = memoAsync(
  () =>
    import('../data/gmbRoutes.json').then((m) =>
      (m.default as SmallRoute[]).map<Route>((r) => ({
        co: 'gmb',
        route: r.route,
        bound: r.bound,
        service_type: r.st,
        orig_tc: r.oTc,
        dest_tc: r.dTc,
        uid: r.uid,
      })),
    ),
  Infinity,
)

/** 路線清單(細檔,搜尋用)。失敗今次當冇綠van,下次再試 */
export function gmbRoutesAsync(): Promise<Route[]> {
  return loadRoutes().catch((): Route[] => [])
}

/**
 * 一條線嘅站序。uid(gtfsId)去程回程共用,要連 bound 先分到;
 * 冇 bound(舊 caller)就先 O 後 I。資料載唔到 → 拋中文錯誤畀路線頁顯示,唔好出空白頁。
 */
export async function gmbRouteStops(uid: string, bound?: 'I' | 'O'): Promise<RouteStopInfo[]> {
  let d: GmbShard
  try {
    d = await loadShard(gmbShardOf(uid))
  } catch {
    throw new Error('綠van 車站資料載入唔到,請檢查網絡再試')
  }
  const ids = (bound ? d.r[`${uid}|${bound}`] : (d.r[`${uid}|O`] ?? d.r[`${uid}|I`])) ?? []
  return ids.map((id, i) => {
    const s = d.s[id]
    return { seq: i + 1, stopId: id, name: s?.[2] ?? id, lat: s?.[0] ?? 0, lng: s?.[1] ?? 0 }
  })
}
