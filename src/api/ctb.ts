// 城巴 (Citybus, CTB) Open Data API
// 文件: https://data.gov.hk/tc-data/dataset/ctb-eta-data-eta-bus
// base: rt.data.gov.hk/v2/transport/citybus,支援 CORS、免 key、免費。
// 注意:CTB 無 service_type、亦無 route-eta(全線一次)endpoint。
import type { Eta, Route, Stop } from './bus'

const BASE = 'https://rt.data.gov.hk/v2/transport/citybus'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`CTB API ${res.status}: ${path}`)
  const json = (await res.json()) as { data: T }
  return json.data
}

interface CtbRouteRaw {
  route: string
  orig_tc: string
  dest_tc: string
}

/** CTB 全部路線。每條拆成去(O)、回(I)兩個方向;循環線只留 O。 */
export async function fetchCtbRoutes(): Promise<Route[]> {
  const data = await get<CtbRouteRaw[]>('/route/CTB')
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

const stopCache = new Map<string, Stop | null>()

/** CTB 站資料(逐個 fetch,有 cache) */
export async function fetchCtbStop(stopId: string): Promise<Stop | null> {
  if (stopCache.has(stopId)) return stopCache.get(stopId)!
  try {
    const d = await get<{
      stop: string
      name_tc: string
      lat: string
      long: string
    }>(`/stop/${stopId}`)
    const stop: Stop = { stop: d.stop, name_tc: d.name_tc, lat: d.lat, long: d.long }
    stopCache.set(stopId, stop)
    return stop
  } catch {
    stopCache.set(stopId, null)
    return null
  }
}

/** CTB 指定站 + 路線到站時間 */
export async function fetchCtbEta(
  stopId: string,
  route: string,
  bound: 'I' | 'O',
): Promise<Eta[]> {
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
