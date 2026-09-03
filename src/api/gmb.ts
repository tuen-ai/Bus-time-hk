// 綠色專線小巴 (GMB) ETA API。base: data.etagmb.gov.hk,免 key、CORS。
// GMB 無 route_code→route_id 直接對應 → 用 /stop-route 解析,再取 /eta/stop。
import type { Eta } from './bus'

const BASE = 'https://data.etagmb.gov.hk'

interface StopRouteEntry {
  route_id: number | string
  route_seq: number | string
  route_code?: string
  route_no?: string
}

const srCache = new Map<string, StopRouteEntry[]>()

async function stopRoutes(stopId: string): Promise<StopRouteEntry[]> {
  if (srCache.has(stopId)) return srCache.get(stopId)!
  try {
    const res = await fetch(`${BASE}/stop-route/${stopId}`)
    if (!res.ok) throw new Error()
    const json = (await res.json()) as { data?: { routes?: StopRouteEntry[] } | StopRouteEntry[] }
    const data = json.data
    const arr = Array.isArray(data) ? data : (data?.routes ?? [])
    srCache.set(stopId, arr)
    return arr
  } catch {
    srCache.set(stopId, [])
    return []
  }
}

/** GMB 指定站 + 路線(route 號 + 方向)嘅到站時間 */
export async function fetchGmbEta(stopId: string, routeCode: string, bound: 'I' | 'O'): Promise<Eta[]> {
  const targetSeq = bound === 'O' ? 1 : 2
  const sr = await stopRoutes(stopId)
  const codeOf = (e: StopRouteEntry) => String(e.route_code ?? e.route_no ?? '')
  const match =
    sr.find((e) => codeOf(e) === routeCode && Number(e.route_seq) === targetSeq) ??
    sr.find((e) => codeOf(e) === routeCode)
  if (!match) return []

  try {
    const res = await fetch(`${BASE}/eta/stop/${stopId}`)
    if (!res.ok) throw new Error()
    const json = (await res.json()) as {
      data?:
        | { route_id: number | string; route_seq: number | string; eta?: RawEta[] }[]
        | { routes?: { route_id: number | string; route_seq: number | string; eta?: RawEta[] }[] }
    }
    const data = json.data
    const rows = Array.isArray(data) ? data : (data?.routes ?? [])
    const mine = rows.filter(
      (r) => String(r.route_id) === String(match.route_id) && Number(r.route_seq) === Number(match.route_seq),
    )
    const out: Eta[] = []
    for (const r of mine) {
      for (const e of r.eta ?? []) {
        out.push({
          co: 'gmb',
          route: routeCode,
          dir: bound,
          service_type: 1,
          seq: 0,
          dest_tc: '',
          eta_seq: Number(e.eta_seq ?? out.length + 1),
          eta: e.timestamp ?? null,
          rmk_tc: String(e.remarks_tc ?? ''),
          data_timestamp: '',
        })
      }
    }
    return out.sort((a, b) => a.eta_seq - b.eta_seq)
  } catch {
    return []
  }
}

interface RawEta {
  eta_seq?: number
  diff?: number
  timestamp?: string
  remarks_tc?: string
}

/** 一個 GMB 站所有路線嘅下幾班(附近 tab 用):stop-route + eta/stop 兩炮搞掂 */
export interface GmbStopRow {
  routeCode: string
  routeSeq: number // 1=O, 2=I
  minsList: number[] // 下一班、下下班…(分鐘)
}

export async function fetchGmbStopAll(stopId: string): Promise<GmbStopRow[]> {
  const sr = await stopRoutes(stopId)
  if (!sr.length) return []
  try {
    const res = await fetch(`${BASE}/eta/stop/${stopId}`, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error()
    const json = (await res.json()) as {
      data?:
        | { route_id: number | string; route_seq: number | string; eta?: RawEta[] }[]
        | { routes?: { route_id: number | string; route_seq: number | string; eta?: RawEta[] }[] }
    }
    const data = json.data
    const rows = Array.isArray(data) ? data : (data?.routes ?? [])
    const out: GmbStopRow[] = []
    for (const r of rows) {
      const match = sr.find(
        (e) => String(e.route_id) === String(r.route_id) && Number(e.route_seq) === Number(r.route_seq),
      )
      if (!match) continue
      const code = String(match.route_code ?? match.route_no ?? '')
      if (!code) continue
      const minsList = (r.eta ?? [])
        .map((e) =>
          e.diff != null
            ? Number(e.diff)
            : e.timestamp
              ? Math.round((new Date(e.timestamp).getTime() - Date.now()) / 60000)
              : null,
        )
        .filter((m): m is number => m != null && m > -2)
        .sort((a, b) => a - b)
      if (!minsList.length) continue
      out.push({ routeCode: code, routeSeq: Number(r.route_seq), minsList })
    }
    return out
  } catch {
    return []
  }
}
