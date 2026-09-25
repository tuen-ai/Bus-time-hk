// 城巴 (Citybus, CTB) Open Data API
// 文件: https://data.gov.hk/tc-data/dataset/ctb-eta-data-eta-bus
// base: rt.data.gov.hk/v2/transport/citybus,支援 CORS、免 key、免費。
// 注意:CTB 無 service_type、亦無 route-eta(全線一次)endpoint。
import type { Eta, Route, Stop } from './bus'
import { fetchJson } from '../lib/http'
import { cacheGet, cachePut } from '../lib/kv'

const BASE = 'https://rt.data.gov.hk/v2/transport/citybus'
// 全部路線清單大,慢網要耐啲;其他照 http.ts 預設 12 秒
const ROUTES_TIMEOUT_MS = 30_000

async function get<T>(path: string, timeoutMs?: number): Promise<T> {
  return (await fetchJson<{ data: T }>(`${BASE}${path}`, { timeoutMs })).data
}

interface CtbRouteRaw {
  route: string
  orig_tc: string
  dest_tc: string
}

/** CTB 全部路線。每條拆成去(O)、回(I)兩個方向;循環線只留 O。 */
export async function fetchCtbRoutes(): Promise<Route[]> {
  const data = await get<CtbRouteRaw[]>('/route/CTB', ROUTES_TIMEOUT_MS)
  const out: Route[] = []
  for (const r of data) {
    if (!r.route) continue
    out.push({
      co: 'ctb',
      route: r.route,
      bound: 'O',
      service_type: '1',
      orig_tc: r.orig_tc,
      dest_tc: r.dest_tc,
    })
    // 非循環線先有回程
    if (r.orig_tc !== r.dest_tc) {
      out.push({
        co: 'ctb',
        route: r.route,
        bound: 'I',
        service_type: '1',
        orig_tc: r.dest_tc,
        dest_tc: r.orig_tc,
      })
    }
  }
  return out
}

interface CtbRouteStopRaw {
  seq: string
  stop: string
}

export async function fetchCtbRouteStops(
  route: string,
  bound: 'I' | 'O',
): Promise<{ seq: string; stop: string }[]> {
  const dir = bound === 'O' ? 'outbound' : 'inbound'
  const data = await get<CtbRouteStopRaw[]>(`/route-stop/CTB/${route}/${dir}`)
  return data.map((d) => ({ seq: d.seq, stop: d.stop }))
}

// ---- 站資料(CTB 冇全部站 endpoint,只可以逐個 fetch)----
// 站名 / 座標幾乎唔變 → 放 IndexedDB 30 日,重開 app 再開同一條線唔使再逐個站 fetch。
// 30 日由「第一次寫入」計(每次寫都更新時間嘅話,常用嘅人份快取永遠唔會刷新)。
const STOPS_KEY = 'ctb.stops'
const STOPS_MAX_AGE = 30 * 24 * 60 * 60 * 1000
const SAVE_DELAY_MS = 800

type StopStore = { map: Record<string, Stop>; ts: number }
let storeP: Promise<StopStore> | null = null
const pending = new Map<string, Promise<Stop | null>>()
let saveTimer: ReturnType<typeof setTimeout> | null = null

function loadStore(): Promise<StopStore> {
  storeP ??= cacheGet<Record<string, Stop>>(STOPS_KEY, STOPS_MAX_AGE).then(
    // 壞咗嘅快取(唔係 object)當冇,唔好令成條線 throw
    (hit) =>
      hit && hit.data && typeof hit.data === 'object'
        ? { map: hit.data, ts: Date.now() - hit.age }
        : { map: {}, ts: Date.now() },
    () => ({ map: {}, ts: Date.now() }),
  )
  return storeP
}

/** 一條線幾十個站陸續返 → 等靜咗先一次過寫(保留第一次寫入時間) */
function scheduleSave(): void {
  if (saveTimer != null) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void flushCtbStops(), SAVE_DELAY_MS)
}

/** 即刻寫低未寫嘅站(平時唔使 call;測試 / 離開頁面前可以用) */
export async function flushCtbStops(): Promise<void> {
  if (saveTimer == null) return
  clearTimeout(saveTimer)
  saveTimer = null
  const s = await loadStore()
  await cachePut(STOPS_KEY, s.map, s.ts)
}

async function fetchStopFresh(stopId: string, store: StopStore): Promise<Stop | null> {
  try {
    const d = await get<{ stop?: string; name_tc?: string; lat?: string; long?: string }>(`/stop/${stopId}`)
    // 空 data(例如站已取消)唔好當有效站寫入快取
    if (!d?.name_tc) return null
    const stop: Stop = { stop: d.stop ?? stopId, name_tc: d.name_tc, lat: d.lat ?? '', long: d.long ?? '' }
    store.map[stopId] = stop
    scheduleSave()
    return stop
  } catch {
    // 失敗唔記低:下次開呢條線再試(以前記死 null,成個 session 都得站號、地圖冇個站)
    return null
  }
}

/** CTB 站資料(IndexedDB 30 日快取;同一個站同時幾個 caller 只 fetch 一次) */
export async function fetchCtbStop(stopId: string): Promise<Stop | null> {
  const store = await loadStore()
  const hit = store.map[stopId]
  if (hit) return hit
  let p = pending.get(stopId)
  if (!p) {
    p = fetchStopFresh(stopId, store).finally(() => pending.delete(stopId))
    pending.set(stopId, p)
  }
  return p
}

/** 測試用:清走記憶體狀態(IndexedDB 唔郁) */
export function _resetCtbStopsForTests(): void {
  storeP = null
  pending.clear()
  if (saveTimer != null) clearTimeout(saveTimer)
  saveTimer = null
}

/** CTB 指定站 + 路線到站時間 */
export async function fetchCtbEta(stopId: string, route: string, bound: 'I' | 'O'): Promise<Eta[]> {
  const data = await get<Record<string, unknown>[]>(`/eta/CTB/${stopId}/${route}`)
  return data
    .filter((e) => normDir(String(e.dir)) === bound)
    .map((e) => ({
      co: 'ctb' as const,
      route: String(e.route),
      dir: bound,
      service_type: 1,
      seq: Number(e.seq),
      dest_tc: String(e.dest_tc ?? ''),
      eta_seq: Number(e.eta_seq),
      eta: (e.eta as string | null) ?? null,
      rmk_tc: String(e.rmk_tc ?? ''),
      data_timestamp: String(e.data_timestamp ?? ''),
    }))
}

function normDir(dir: string): 'I' | 'O' {
  return dir.toUpperCase().startsWith('I') ? 'I' : 'O'
}
