// 綠色專線小巴 (GMB) ETA API。base: data.etagmb.gov.hk,免 key、CORS。
// GMB 無 route_code→route_id 直接對應 → 用 /stop-route 解析,再取 /eta/stop。
import type { Eta } from './bus'
import { HttpError, fetchJson } from '../lib/http'

const BASE = 'https://data.etagmb.gov.hk'

export interface StopRouteEntry {
  route_id: number | string
  route_seq: number | string
  route_code?: string
  route_no?: string
}

// 只快取成功結果(以前失敗都記做 [],成個 session 個站都變「暫無預計班次」);
// 放 promise 入去 → 同一個站同時幾個 caller(收藏 + 附近)只發一次
const srCache = new Map<string, Promise<StopRouteEntry[]>>()

function stopRoutes(stopId: string): Promise<StopRouteEntry[]> {
  const hit = srCache.get(stopId)
  if (hit) return hit
  const p = fetchJson<{ data?: { routes?: StopRouteEntry[] } | StopRouteEntry[] }>(
    `${BASE}/stop-route/${stopId}`,
  ).then(
    (json) => {
      const data = json.data
      return Array.isArray(data) ? data : (data?.routes ?? [])
    },
    (e: unknown) => {
      // 404 = 呢個站真係冇路線,當空(可以記住);斷線 / 逾時 / 5xx 照拋
      if (e instanceof HttpError && e.status === 404) return []
      throw e
    },
  )
  // 失敗 → 由快取剔走,下次再試
  p.catch(() => {
    if (srCache.get(stopId) === p) srCache.delete(stopId)
  })
  srCache.set(stopId, p)
  return p
}

type EtaStopResp = {
  data?:
    | { route_id: number | string; route_seq: number | string; eta?: RawEta[] }[]
    | { routes?: { route_id: number | string; route_seq: number | string; eta?: RawEta[] }[] }
}

/** /eta/stop:一個站所有路線嘅到站時間 */
async function etaStop(stopId: string, timeoutMs?: number) {
  const json = await fetchJson<EtaStopResp>(`${BASE}/eta/stop/${stopId}`, { timeoutMs })
  const data = json.data
  return Array.isArray(data) ? data : (data?.routes ?? [])
}

/** 揀返 stop-route 入面屬於呢條線嘅一行(純函數,test 用) */
export function matchStopRoute(
  sr: StopRouteEntry[],
  routeCode: string,
  bound: 'I' | 'O',
  routeId?: string,
): StopRouteEntry | undefined {
  const targetSeq = bound === 'O' ? 1 : 2
  // routeId(= app 嘅 GMB uid / gtfsId)對到就只信佢:同一個站同號嘅唔同線(例如 101M 幾條特別班)
  // 分得開;方向對唔到 = 呢條線呢個方向唔經呢個站,唔好靜靜雞跳去對面方向
  const byId = routeId ? sr.filter((e) => String(e.route_id) === routeId) : []
  if (byId.length) return byId.find((e) => Number(e.route_seq) === targetSeq)
  // 冇 routeId(舊收藏)/ 對唔到(資料版本唔同):照舊用 route 號
  const codeOf = (e: StopRouteEntry) => String(e.route_code ?? e.route_no ?? '')
  return (
    sr.find((e) => codeOf(e) === routeCode && Number(e.route_seq) === targetSeq) ??
    sr.find((e) => codeOf(e) === routeCode)
  )
}

/** GMB 指定站 + 路線(route 號 + 方向;有 routeId 就用佢分同號線)嘅到站時間 */
export async function fetchGmbEta(
  stopId: string,
  routeCode: string,
  bound: 'I' | 'O',
  routeId?: string,
): Promise<Eta[]> {
  const sr = await stopRoutes(stopId)
  const match = matchStopRoute(sr, routeCode, bound, routeId)
  if (!match) return []

  // 唔好 catch:斷線要交返 EtaPanel / 收藏顯示錯誤,唔好扮「暫無預計班次」
  const rows = await etaStop(stopId)
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
  routeId: string // etagmb route_id = app GMB uid(同號跨區分得開)
  minsList: number[] // 下一班、下下班…(分鐘)
}

export async function fetchGmbStopAll(stopId: string): Promise<GmbStopRow[]> {
  // 失敗照拋:nearby.ts 用 allSettled,單一站失敗只係少咗嗰個站;全部站都失敗先出錯(唔好扮「附近冇小巴」)
  const sr = await stopRoutes(stopId)
  if (!sr.length) return []
  const rows = await etaStop(stopId, 15_000)
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
    out.push({ routeCode: code, routeSeq: Number(r.route_seq), routeId: String(match.route_id), minsList })
  }
  return out
}
