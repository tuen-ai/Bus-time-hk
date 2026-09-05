// 統一營辦商層:KMB + CTB。components 一律用呢度,唔直接 call 個別營辦商。
import * as kmb from './kmb'
import * as ctb from './ctb'
import { fetchLrtSchedule } from './lrt'
import { fetchNlbEta } from './nlb'
import { fetchGmbEta } from './gmb'
import { lrRoutes, lrRouteStops } from '../lib/lrData'
import { nlbRoutes, nlbRouteStops, nlbRouteId } from '../lib/nlbData'
import { gmbRoutesAsync, gmbRouteStops } from '../lib/gmbData'
import { getStopMap } from '../lib/store'
import { cacheGet, cachePut } from '../lib/kv'

export type Co = 'kmb' | 'ctb' | 'lrt' | 'nlb' | 'gmb'

export interface Route {
  co: Co
  route: string
  bound: 'I' | 'O'
  service_type: string
  orig_tc: string
  dest_tc: string
  uid?: string // GMB 用 gtfsId 做唯一鍵(route 號跨區重複)
}

export interface Stop {
  stop: string
  name_tc: string
  lat: string
  long: string
}

export interface Eta {
  co: Co
  route: string
  dir: 'I' | 'O'
  service_type: number
  seq: number
  dest_tc: string
  eta_seq: number
  eta: string | null
  rmk_tc: string
  data_timestamp: string
}

export interface RouteStopInfo {
  seq: number
  stopId: string
  name: string
  lat: number
  lng: number
}

const CO_LABEL: Record<Co, string> = {
  kmb: '九巴',
  ctb: '城巴',
  lrt: '輕鐵',
  nlb: '嶼巴',
  gmb: '綠van',
}

export const coLabel = (co: Co): string => CO_LABEL[co] ?? '九巴'

/** route-badge 顏色 class(九巴用預設粉紅,唔加 class) */
export const coClass = (co: Co): string => (co === 'kmb' ? '' : `co-${co}`)

/** 路線唯一鍵(co|route|bound|serviceType)—— 收藏、推薦、規劃 leg 都用呢個對返 Route */
export interface RouteKeyLike {
  co: Co
  route: string
  bound: 'I' | 'O'
  serviceType: string
}

export const routeKey = (k: RouteKeyLike): string => `${k.co}|${k.route}|${k.bound}|${k.serviceType}`

export const routeKeyOf = (r: Route): string => `${r.co}|${r.route}|${r.bound}|${r.service_type}`

export const CO_COLOR: Record<Co, string> = {
  kmb: '#c8102e',
  ctb: '#0e7490',
  nlb: '#00857c',
  gmb: '#167a3a',
  lrt: '#7d3c98',
}

// 搜尋頁車種選擇:全部 + 五個營辦商(港鐵喺獨立「鐵路」分頁)
export const SEARCH_OPERATORS: Co[] = ['kmb', 'ctb', 'nlb', 'gmb', 'lrt']

/** 分批並行 map(每批 size 個),避免一次過開太多連線 */
async function batchMap<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
  }
  return out
}

// ---- 路線清單(五個營辦商合併,IndexedDB 緩存)----
const DAY = 24 * 60 * 60 * 1000
const ROUTES_KEY = 'bus.routes'
let routeMem: Route[] | null = null

/** 上次拎路線清單時攞唔到嘅營辦商(網絡 / CORS 問題)。殘缺清單唔會寫入快取。 */
let missing: Co[] = []
export const missingOperators = (): Co[] => missing

/** 九巴佔成個清單約四成 —— 冇九巴多數係當時 fetch 失敗,唔好信呢份快取 */
const looksComplete = (rs: Route[]): boolean => rs.some((r) => r.co === 'kmb')

/**
 * stale-while-revalidate:7 日內嘅 cache 即刻回(app 即開即用);
 * 過咗 1 日就背景刷新,完成後經 onRefresh 靜靜更新 UI。
 * 快取放 IndexedDB(幾 MB,localStorage 會爆);舊 localStorage 資料會自動搬過嚟。
 */
export async function getAllRoutes(onRefresh?: (rs: Route[]) => void): Promise<Route[]> {
  if (routeMem) return routeMem
  const hit = await cacheGet<Route[]>(ROUTES_KEY, 7 * DAY)
  // 舊版本可能快取咗殘缺清單(例如當時九巴 fetch 失敗)—— 當佢冇,重新攞過
  if (hit && hit.data.length > 0 && looksComplete(hit.data)) {
    routeMem = hit.data
    if (hit.age >= DAY) {
      void fetchAllFresh()
        .then((all) => {
          routeMem = all
          saveRoutes(all)
          onRefresh?.(all)
        })
        .catch(() => {})
    }
    return hit.data
  }
  const all = await fetchAllFresh()
  routeMem = all
  saveRoutes(all)
  return all
}

/** 齊料先寫快取:殘缺清單一寫落去就會賴足 7 日,搵唔到成間營辦商嘅路線 */
function saveRoutes(all: Route[]): void {
  if (missing.length === 0 && looksComplete(all)) void cachePut(ROUTES_KEY, all)
}

async function fetchAllFresh(): Promise<Route[]> {
  const [k, c] = await Promise.all([
    kmb
      .fetchRoutes()
      .then((rs) =>
        rs.map<Route>((r) => ({
          co: 'kmb',
          route: r.route,
          bound: r.bound,
          service_type: r.service_type,
          orig_tc: r.orig_tc,
          dest_tc: r.dest_tc,
        })),
      )
      .catch(() => null),
    ctb.fetchCtbRoutes().catch(() => null),
  ])
  // 靜態資料(bundle 入面)—— 理論上唔會 throw,但壞 JSON 都唔好拖冧成個清單
  const safe = (fn: () => Route[]): Route[] | null => {
    try {
      const rs = fn()
      return rs.length ? rs : null
    } catch {
      return null
    }
  }
  const lr = safe(lrRoutes)
  const nl = safe(nlbRoutes)
  const gm = await gmbRoutesAsync().catch(() => null)

  const parts: [Co, Route[] | null][] = [
    ['kmb', k],
    ['ctb', c],
    ['lrt', lr],
    ['nlb', nl],
    ['gmb', gm],
  ]
  missing = parts.filter(([, rs]) => !rs?.length).map(([co]) => co)
  const all = parts.flatMap(([, rs]) => rs ?? [])
  // 全部失敗(離線/CORS)→ 唔好快取空陣列毒化一日,直接拋錯俾 App 顯示重試
  if (all.length === 0) throw new Error('路線資料載入失敗,請稍後重試')
  return all
}

// ---- 路線站序 + 站名/座標 ----
export async function getRouteStops(r: Route): Promise<RouteStopInfo[]> {
  if (r.co === 'lrt') {
    return lrRouteStops(r.route, r.bound, r.service_type)
  }
  if (r.co === 'nlb') {
    return nlbRouteStops(r.route, r.bound, r.service_type)
  }
  if (r.co === 'gmb') {
    return r.uid ? gmbRouteStops(r.uid) : []
  }
  if (r.co === 'kmb') {
    const [rs, stopMap] = await Promise.all([
      kmb.fetchRouteStops(r.route, r.bound, r.service_type),
      getStopMap(),
    ])
    return rs
      .sort((a, b) => Number(a.seq) - Number(b.seq))
      .map((s) => {
        const info = stopMap.get(s.stop)
        return {
          seq: Number(s.seq),
          stopId: s.stop,
          name: info?.name_tc ?? s.stop,
          lat: Number(info?.lat ?? 0),
          lng: Number(info?.long ?? 0),
        }
      })
  }
  // CTB:逐個站 fetch(分批並行避免一次過幾十個連線,有 cache)
  const rs = await ctb.fetchCtbRouteStops(r.route, r.bound)
  const infos = await batchMap(rs, 16, (s) => ctb.fetchCtbStop(s.stop))
  return rs
    .map((s, i) => {
      const info = infos[i]
      return {
        seq: Number(s.seq),
        stopId: s.stop,
        name: info?.name_tc ?? s.stop,
        lat: Number(info?.lat ?? 0),
        lng: Number(info?.long ?? 0),
      }
    })
    .sort((a, b) => a.seq - b.seq)
}

// ---- 指定站 + 路線到站時間 ----
export async function getEta(r: Route, stopId: string): Promise<Eta[]> {
  if (r.co === 'kmb') {
    const data = await kmb.fetchEta(stopId, r.route, r.service_type)
    return data.map((e) => ({ ...e, co: 'kmb' }))
  }
  if (r.co === 'ctb') {
    return ctb.fetchCtbEta(stopId, r.route, r.bound)
  }
  if (r.co === 'gmb') {
    return fetchGmbEta(stopId, r.route, r.bound)
  }
  if (r.co === 'nlb') {
    const id = nlbRouteId(r.route, r.bound, r.service_type)
    if (!id) return []
    const arrs = await fetchNlbEta(id, stopId)
    return arrs.map((a, i) => ({
      co: 'nlb' as const,
      route: r.route,
      dir: r.bound,
      service_type: 1,
      seq: 0,
      dest_tc: r.dest_tc,
      eta_seq: i + 1,
      eta: a.eta,
      rmk_tc: a.noGps ? '預定班次' : a.departed ? '已開出' : '',
      data_timestamp: '',
    }))
  }
  // 輕鐵:由站取所有路綫下一班,filter 出本路綫,轉成統一 Eta
  const trains = await fetchLrtSchedule(Number(stopId.slice(2)))
  const now = Date.now()
  return trains
    .filter((t) => t.route === r.route)
    .map((t, i) => ({
      co: 'lrt' as const,
      route: r.route,
      dir: r.bound,
      service_type: 1,
      seq: 0,
      dest_tc: t.destTc || r.dest_tc,
      eta_seq: i + 1,
      eta: new Date(now + t.mins * 60_000).toISOString(),
      rmk_tc: t.platform ? `月台 ${t.platform}` : '',
      data_timestamp: '',
    }))
}

/** 全線一次過 ETA(供地圖預測用)。CTB 無此 endpoint → 回傳 null。 */
export async function getRouteEta(r: Route): Promise<Eta[] | null> {
  if (r.co !== 'kmb') return null
  const data = await kmb.fetchRouteEta(r.route, r.service_type)
  return data.map((e) => ({ ...e, co: 'kmb' }))
}
