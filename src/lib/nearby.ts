// 附近巴士(route-centric):支援九巴 / 城巴 / 綠van,逐營辦商查。
// - KMB:官方 stopList + /stop-eta(一炮一站)
// - CTB:planGraph 站座標 + 逐路線 /eta(冇 stop-eta endpoint,批量發)
// - GMB:planGraph 站座標 + /stop-route + /eta/stop(一站兩炮)
// 另附 localStorage 結果 cache,畀「一開 tab 即有嘢睇」。
// 斷網 ≠ 附近冇車:全部請求都失敗就 throw,等畫面保留上次結果 + 出重試。
import { fetchStopEta, type Stop } from '../api/kmb'
import { fetchCtbEta } from '../api/ctb'
import { fetchGmbStopAll } from '../api/gmb'
import { getStopMap } from './store'
import { distanceMeters } from './geo'
import { minutesUntil } from './time'
import { loadGraph, nearStops, toAppKey, type Indexed } from './planGraph'
import { friendlyError } from './http'
import { zhErrorOr } from './errorText'
import { lsGet, lsSet } from './ls'

export type NearbyCo = 'kmb' | 'ctb' | 'gmb'
export const NEARBY_COS: NearbyCo[] = ['kmb', 'ctb', 'gmb']
export type NearbyTab = NearbyCo | 'fit'

export interface LatLng {
  lat: number
  lng: number
}

export interface NearbyRow {
  co: NearbyCo
  route: string
  dir: 'I' | 'O'
  serviceType: string
  dest: string
  stopId: string
  stopName: string
  dist: number
  mins: number[] // 下一班、下下一班…(最多 3 班)
  uid?: string // 綠van:etagmb route_id(= app GMB uid),開路線頁對返同號跨區 / 特別班嗰條
}

const KMB_STOPS = 8
const GRAPH_STOPS = 5 // ctb/gmb 每次查幾多個站
const MAX_ROUTE_CALLS = 24 // ctb 逐路線上限(防止爆 request)

/** 車號排序:純數字細→大行先(1, 2, 11, 269),之後先到帶英文字母嘅(1A, 269D, N21) */
export function routeCompare(a: string, b: string): number {
  const pureA = /^\d+$/.test(a)
  const pureB = /^\d+$/.test(b)
  if (pureA !== pureB) return pureA ? -1 : 1 // 純數字排先
  const numA = Number(/\d+/.exec(a)?.[0] ?? Infinity)
  const numB = Number(/\d+/.exec(b)?.[0] ?? Infinity)
  if (numA !== numB) return numA - numB // 再按數字部分
  return a.localeCompare(b) // 最後按字面(1A < 1B;N21 之類)
}

export function sortRows(rows: NearbyRow[]): NearbyRow[] {
  return rows
    .map((r) => ({ ...r, mins: r.mins.slice(0, 3) }))
    .sort(
      (a, b) => routeCompare(a.route, b.route) || (a.mins[0] ?? 999) - (b.mins[0] ?? 999) || a.dist - b.dist,
    )
}

// ---- 錯誤 ----
/** message 已經係俾用家睇嘅廣東話 */
export class NearbyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NearbyError'
  }
}

const OFFLINE_MSG = '攞唔到到站時間 · 冇網絡連線'

/** 逐個請求可以獨立失敗(照顯示其他站);但全部都失敗(多數係斷網)就唔好扮「附近冇車」 */
export function settledOrThrow<T>(results: PromiseSettledResult<T>[]): T[] {
  const ok: T[] = []
  let failed: { reason: unknown } | null = null
  for (const r of results) {
    if (r.status === 'fulfilled') ok.push(r.value)
    else if (!failed) failed = { reason: r.reason }
  }
  if (failed && ok.length === 0) throw new NearbyError(`攞唔到到站時間 · ${friendlyError(failed.reason)}`)
  return ok
}

/** 俾畫面顯示嘅錯誤文字(唔會出 "Failed to fetch" 之類英文;自己寫嘅中文訊息例如路線圖載入唔到就照出) */
export function nearbyErrorText(e: unknown): string {
  return e instanceof NearbyError ? e.message : zhErrorOr(e, friendlyError(e))
}

// ---- KMB(照舊:官方 stop-eta)----
// 同一位置每 5 秒刷新一次 → 6000+ 個站嘅距離排序記住,唔使每次重計
let nearestMemo: { key: string; list: { s: Stop; d: number }[] } | null = null

function nearestKmbStops(stopMap: Map<string, Stop>, lat: number, lng: number) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
  if (nearestMemo?.key === key) return nearestMemo.list
  const list = [...stopMap.values()]
    .map((s) => ({ s, d: distanceMeters(lat, lng, Number(s.lat), Number(s.long)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, KMB_STOPS)
  nearestMemo = { key, list }
  return list
}

async function nearbyKmb(lat: number, lng: number): Promise<NearbyRow[]> {
  const stopMap = await getStopMap()
  if (stopMap.size === 0) throw new NearbyError('未能載入車站資料,請重試')
  const nearest = nearestKmbStops(stopMap, lat, lng)

  const now = Date.now()
  const settled = await Promise.allSettled(
    nearest.map(async ({ s, d }) => {
      const etas = await fetchStopEta(s.stop)
      const groups = new Map<string, NearbyRow>()
      for (const e of etas) {
        if (!e.eta) continue
        const m = minutesUntil(e.eta, now)
        if (m == null) continue
        const key = `${e.route}|${e.dir}|${e.service_type}`
        let row = groups.get(key)
        if (!row) {
          row = {
            co: 'kmb',
            route: e.route,
            dir: e.dir,
            serviceType: String(e.service_type),
            dest: e.dest_tc,
            stopId: s.stop,
            stopName: s.name_tc,
            dist: d,
            mins: [],
          }
          groups.set(key, row)
        }
        row.mins.push(m)
      }
      for (const row of groups.values()) row.mins.sort((a, b) => a - b)
      return [...groups.values()]
    }),
  )
  return sortRows(settledOrThrow(settled).flat())
}

// ---- planGraph 站(ctb / gmb 共用)----
interface GraphStop {
  id: string
  dist: number
  name: string
}

async function graphNearStops(ix: Indexed, lat: number, lng: number, co: string): Promise<GraphStop[]> {
  const near = nearStops(ix, lat, lng, 500, 40)
  const out: GraphStop[] = []
  for (const n of near) {
    const rs = ix.stopRoutes.get(n.id) ?? []
    if (!rs.some(({ ri }) => ix.routeByIdx[ri].co === co)) continue
    out.push({ id: n.id, dist: n.dist, name: ix.graph.stops[n.id]?.[2] ?? n.id })
    if (out.length >= GRAPH_STOPS) break
  }
  return out
}

// ---- CTB(逐路線 ETA,批量限流)----
async function nearbyCtb(lat: number, lng: number): Promise<NearbyRow[]> {
  const ix = await loadGraph()
  const stops = await graphNearStops(ix, lat, lng, 'ctb')
  if (!stops.length) return []

  // 收集 (站, 路線) 對,cap 總數
  const jobs: { st: GraphStop; route: string; bound: 'I' | 'O'; dest: string }[] = []
  for (const st of stops) {
    const seen = new Set<string>()
    for (const { ri, seq } of ix.stopRoutes.get(st.id) ?? []) {
      const r = ix.routeByIdx[ri]
      if (r.co !== 'ctb') continue
      // 循環線(OI / IO)睇呢個站喺邊半程,轉返 app 嘅 I / O
      const bound = toAppKey(ix, ri, seq).bound
      const k = `${r.r}|${bound}`
      if (seen.has(k)) continue
      seen.add(k)
      jobs.push({ st, route: r.r, bound, dest: r.d })
      if (jobs.length >= MAX_ROUTE_CALLS) break
    }
    if (jobs.length >= MAX_ROUTE_CALLS) break
  }

  const now = Date.now()
  const settled: PromiseSettledResult<NearbyRow | null>[] = []
  // 8 個一批
  for (let i = 0; i < jobs.length; i += 8) {
    const part = await Promise.allSettled(
      jobs.slice(i, i + 8).map(async (j) => {
        const etas = await fetchCtbEta(j.st.id, j.route, j.bound)
        const mins = etas
          .map((e) => (e.eta ? minutesUntil(e.eta, now) : null))
          .filter((m): m is number => m != null)
          .sort((a, b) => a - b)
        if (!mins.length) return null
        const row: NearbyRow = {
          co: 'ctb',
          route: j.route,
          dir: j.bound,
          serviceType: '1',
          dest: etas[0]?.dest_tc || j.dest,
          stopId: j.st.id,
          stopName: j.st.name,
          dist: j.st.dist,
          mins,
        }
        return row
      }),
    )
    settled.push(...part)
    // 成批都失敗 → 多數斷咗網,唔好再逐條路線撞
    if (part.every((p) => p.status === 'rejected')) break
  }
  return sortRows(settledOrThrow(settled).filter((x): x is NearbyRow => x !== null))
}

// ---- GMB(/eta/stop 一站全路線)----
async function nearbyGmb(lat: number, lng: number): Promise<NearbyRow[]> {
  const ix = await loadGraph()
  const stops = await graphNearStops(ix, lat, lng, 'gmb')
  if (!stops.length) return []

  const settled = await Promise.allSettled(
    stops.map(async (st) => {
      const all = await fetchGmbStopAll(st.id)
      return all.map<NearbyRow>((g) => {
        const bound = g.routeSeq === 2 ? 'I' : 'O'
        // 由 planGraph 對返目的地名
        const pr = (ix.stopRoutes.get(st.id) ?? [])
          .map(({ ri }) => ix.routeByIdx[ri])
          .find((r) => r.co === 'gmb' && r.r === g.routeCode && r.b === bound)
        return {
          co: 'gmb',
          route: g.routeCode,
          dir: bound,
          serviceType: '1',
          dest: pr?.d ?? '',
          stopId: st.id,
          stopName: st.name,
          dist: st.dist,
          mins: g.minsList,
          uid: g.routeId,
        }
      })
    }),
  )
  // 同一路線喺幾個站出現 → 留最近嗰個站
  const best = new Map<string, NearbyRow>()
  for (const r of settledOrThrow(settled).flat()) {
    const k = `${r.route}|${r.dir}`
    const cur = best.get(k)
    if (!cur || r.dist < cur.dist) best.set(k, r)
  }
  return sortRows([...best.values()])
}

/**
 * 城巴 / 綠van 靠規劃圖(~440KB gzip)搵附近站:一揀咗呢兩個 chip / 開 tab 就開始載,同定位並行,
 * 唔好等 GPS 返咗先開始。memo 咗,重複叫冇成本;慳數據模式都照載(查詢本身就要用);失敗唔理,查詢嗰陣會再試 + 出錯
 */
export function warmNearbyGraph(tab: NearbyTab): void {
  // 經 then 叫:就算 loadGraph 同步出事都只係食咗,唔會拖冧 caller 個 effect
  if (tab === 'ctb' || tab === 'gmb')
    void Promise.resolve()
      .then(loadGraph)
      .catch(() => {})
}

export async function nearbyBuses(lat: number, lng: number, co: NearbyCo): Promise<NearbyRow[]> {
  const rows =
    co === 'ctb'
      ? await nearbyCtb(lat, lng)
      : co === 'gmb'
        ? await nearbyGmb(lat, lng)
        : await nearbyKmb(lat, lng)
  // 有啲 API 層會將斷網吞咗變空結果 → 明明冇網就講清楚,唔好話「附近冇車」
  if (!rows.length && typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new NearbyError(OFFLINE_MSG)
  }
  return rows
}

/** 舊結果照倒數:減走過咗嘅分鐘;開走咗嘅班次、冇晒班次嘅路線唔再顯示 */
export function ageRows(rows: NearbyRow[], ageMs: number): NearbyRow[] {
  const gone = Math.floor(Math.max(0, ageMs) / 60_000)
  if (gone === 0) return rows
  return sortRows(
    rows
      .map((r) => ({ ...r, mins: r.mins.map((m) => m - gone).filter((m) => m >= 0) }))
      .filter((r) => r.mins.length > 0),
  )
}

/** 列表上面嗰行提示(冇列表嘅錯誤由大公仔 + 重試負責,呢度唔出) */
export function nearbyNotice(s: {
  hasRows: boolean
  stale: boolean
  error: string | null
  oldLoc: boolean
}): { text: string; retry: boolean } | null {
  if (!s.hasRows) {
    // 「附近暫時冇車」都要講明係上次位置,唔係你而家身處嘅地方
    return s.oldLoc && !s.error ? { text: '📍 定位唔到,顯示緊上次位置附近嘅車', retry: true } : null
  }
  if (s.error) {
    const why = s.stale ? '(顯示緊上次結果)' : s.oldLoc ? '(顯示緊上次位置附近嘅車)' : ''
    return { text: `⚠️ ${s.error}${why}`, retry: true }
  }
  if (s.oldLoc) return { text: '📍 定位唔到,顯示緊上次位置附近嘅車', retry: true }
  if (s.stale) return { text: '⏳ 顯示緊上次結果,更新緊…', retry: false }
  return null
}

// ---- 上次揀嘅 tab(storage 被封都唔好炒車)----
const TAB_KEY = 'kkcx.nearby.co'

export function readNearbyTab(): NearbyTab {
  const s = lsGet(TAB_KEY)
  return s === 'ctb' || s === 'gmb' || s === 'fit' ? s : 'kmb'
}

export function writeNearbyTab(t: NearbyTab): void {
  lsSet(TAB_KEY, t)
}

// ---- 結果 cache(即開即有)----
interface NearbyCache {
  ts: number
  lat: number
  lng: number
  rows: NearbyRow[]
}

const CACHE_TTL = 15 * 60 * 1000

export function readNearbyCache(co: NearbyCo): NearbyCache | null {
  try {
    const c = JSON.parse(lsGet(`kkcx.nearby.${co}`) || 'null') as NearbyCache | null
    if (
      c &&
      Date.now() - c.ts < CACHE_TTL &&
      Number.isFinite(c.lat) &&
      Number.isFinite(c.lng) &&
      Array.isArray(c.rows) &&
      c.rows.length
    )
      return c
  } catch {
    /* 壞咗嘅 JSON 當冇 */
  }
  return null
}

export function writeNearbyCache(co: NearbyCo, lat: number, lng: number, rows: NearbyRow[]): void {
  if (!rows.length) return // 空結果唔好蓋咗上次好嘅 cache
  lsSet(`kkcx.nearby.${co}`, JSON.stringify({ ts: Date.now(), lat, lng, rows }))
}

/** 最近一次成功查詢嘅位置(任何營辦商);只喺定位失敗時用,畫面會標明係「上次位置」 */
export function lastKnownLoc(): LatLng | null {
  let best: NearbyCache | null = null
  for (const co of NEARBY_COS) {
    const c = readNearbyCache(co)
    if (c && (!best || c.ts > best.ts)) best = c
  }
  return best ? { lat: best.lat, lng: best.lng } : null
}
