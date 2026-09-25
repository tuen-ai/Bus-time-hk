// 統一營辦商層:九巴、城巴、輕鐵、嶼巴、綠van。components 一律用呢度,唔直接 call 個別營辦商。
import * as kmb from './kmb'
import * as ctb from './ctb'
import { fetchLrtSchedule } from './lrt'
import { fetchNlbEta } from './nlb'
import { fetchGmbEta } from './gmb'
import { lrBase, lrKnownDests, lrRoutes, lrRouteStops, lrSameDest } from '../lib/lrData'
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
  // 同 key(co|route|bound|st)多條時嘅唯一鍵:GMB = gtfsId(route 號跨區重複,O / I 共用);
  // 嶼巴 = nlbUid(同號同方向有幾個變體)。其他營辦商冇。
  uid?: string
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

// ---- 由 key 對返 Route(收藏 / 附近 / 推薦 / 規劃 leg 共用)----
// GMB 同號跨區、嶼巴同號變體會撞 key → 有 uid 用 uid,冇就用目的地 / 經過嘅站 tiebreak。

/** 同一條線先當係同一條:key 一樣之外,uid 都要一樣(變體 chip 邊個「揀咗」用呢個) */
export const sameRoute = (a: Route, b: Route): boolean =>
  routeKeyOf(a) === routeKeyOf(b) && (a.uid ?? '') === (b.uid ?? '')

/** co|route|bound|serviceType → Route[](同 key 可能多條,保持清單次序) */
export function indexRoutes(routes: Route[]): Map<string, Route[]> {
  const m = new Map<string, Route[]>()
  for (const r of routes) {
    const k = routeKeyOf(r)
    const arr = m.get(k)
    if (arr) arr.push(r)
    else m.set(k, [r])
  }
  return m
}

export interface RouteQuery extends RouteKeyLike {
  uid?: string
  /** 目的地(收藏 / 附近 / 規劃 leg 本身有):同 key 多條時用嚟 tiebreak */
  dest?: string
}

function candidatesOf(index: Map<string, Route[]>, q: RouteKeyLike): Route[] {
  const cands = index.get(routeKey(q)) ?? []
  // 嶼巴 2026-09 上游將回程 bound 由 O 改 I → 舊收藏用相反方向再試一次
  if (!cands.length && q.co === 'nlb') {
    return index.get(routeKey({ ...q, bound: q.bound === 'I' ? 'O' : 'I' })) ?? []
  }
  return cands
}

function byDest(cands: Route[], dest?: string): Route | undefined {
  const d = dest?.trim()
  if (cands.length <= 1 || !d) return cands[0]
  // 兩邊字串來源唔同(API / 靜態資料)→ 先全等,再寬鬆 includes
  return (
    cands.find((x) => x.dest_tc.trim() === d) ??
    cands.find((x) => x.dest_tc !== '' && (x.dest_tc.includes(d) || d.includes(x.dest_tc))) ??
    cands[0]
  )
}

/**
 * uid 對到嘅嗰條:先喺同 key 搵;搵唔到再睇同號同方向其他班次 ——
 * 附近 tab 嘅綠van serviceType 一律當 '1',但 uid(etagmb route_id)先係真,特別班都要開得到
 */
function byUid(index: Map<string, Route[]>, cands: Route[], q: RouteQuery): Route | undefined {
  if (!q.uid) return undefined
  const hit = cands.find((x) => x.uid === q.uid)
  if (hit) return hit
  const pre = `${q.co}|${q.route}|${q.bound}|`
  for (const [k, rs] of index) {
    if (!k.startsWith(pre)) continue
    const r = rs.find((x) => x.uid === q.uid)
    if (r) return r
  }
  return undefined
}

/**
 * 路線清單未載好(第一次開 / 快取過咗 7 日 / 清咗快取 / 載入失敗)時,用 key 本身砌一條臨時 Route,
 * 撳收藏 / 附近 / 規劃 leg 即刻開到路線頁(getRouteStops / getEta 有呢幾樣就夠)。
 * 冇起點站名;清單一到 App 會用 pickRouteAtStop 換返真嗰條。
 */
export const routeFromQuery = (q: RouteQuery): Route => ({
  co: q.co,
  route: q.route,
  bound: q.bound,
  service_type: q.serviceType,
  orig_tc: '',
  dest_tc: q.dest ?? '',
  uid: q.uid,
})

/** 同步版:uid 啱就用;否則目的地 tiebreak;都唔得就清單第一條 */
export function pickRoute(index: Map<string, Route[]>, q: RouteQuery): Route | undefined {
  const cands = candidatesOf(index, q)
  return byUid(index, cands, q) ?? byDest(cands, q.dest)
}

/**
 * 同 pickRoute,但 GMB / 嶼巴同號多條又冇 uid(舊收藏、規劃 leg)時,
 * 再睇邊條真係經過 stopId(兩間都係靜態站序,唔使上網)。
 */
export async function pickRouteAtStop(
  index: Map<string, Route[]>,
  q: RouteQuery & { stopId?: string },
): Promise<Route | undefined> {
  const cands = candidatesOf(index, q)
  const hit = byUid(index, cands, q)
  if (hit) return hit
  const { stopId } = q
  if (cands.length > 1 && stopId && (q.co === 'gmb' || q.co === 'nlb')) {
    const serving = await Promise.all(
      cands.map((r) =>
        getRouteStops(r).then(
          (ss) => ss.some((s) => s.stopId === stopId),
          () => false,
        ),
      ),
    )
    const atStop = cands.filter((_, i) => serving[i])
    if (atStop.length) return byDest(atStop, q.dest)
  }
  return byDest(cands, q.dest)
}

// GMB 同號跨區:變體 bar 只列同區嗰啲(同 uid = 同線兩個方向;特別班 uid 唔同但會共用總站)
const ends = (r: Route): string[] => [r.orig_tc, r.dest_tc].map((s) => s.trim()).filter(Boolean)
const sameArea = (a: Route, b: Route): boolean =>
  a.uid === b.uid || ends(a).some((x) => ends(b).some((y) => x.includes(y) || y.includes(x)))

/** 路線頁頂嘅方向 / 特別班 chip:同營辦商同號;GMB 再剔走其他區嘅同號線 */
export function routeVariants(routes: Route[], sel: Route): Route[] {
  return routes.filter(
    (r) => r.co === sel.co && r.route === sel.route && (r.co !== 'gmb' || !sel.uid || sameArea(r, sel)),
  )
}

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
/** 清單次序(同 fetchAllFresh 合併次序一致) */
const ORDER: Co[] = ['kmb', 'ctb', 'lrt', 'nlb', 'gmb']
/** 齊料清單先會入 routeMem —— 殘缺嘅留喺外面,撳重試先會真係再 fetch */
let routeMem: Route[] | null = null

/** 上次拎路線清單時攞唔到嘅營辦商(網絡 / CORS 問題)。殘缺清單唔會寫入快取。 */
let missing: Co[] = []
export const missingOperators = (): Co[] => missing

/** 九巴佔成個清單約四成 —— 冇九巴多數係當時 fetch 失敗,唔好信呢份快取 */
const looksComplete = (rs: Route[]): boolean => rs.some((r) => r.co === 'kmb')

// 靜態資料(bundle 入面)—— 理論上唔會 throw,但壞 JSON 都唔好拖冧成個清單
const safe = (fn: () => Route[]): Route[] | null => {
  try {
    const rs = fn()
    return rs.length ? rs : null
  } catch {
    return null
  }
}

/** 輕鐵 / 嶼巴係 bundle 入面嘅靜態資料 → 用返今個版本(舊快取嘅嶼巴行冇 uid,分唔到同號變體) */
function withStaticRoutes(rs: Route[]): Route[] {
  const fresh: Partial<Record<Co, Route[] | null>> = { lrt: safe(lrRoutes), nlb: safe(nlbRoutes) }
  return ORDER.flatMap((co) => fresh[co] ?? rs.filter((r) => r.co === co))
}

/**
 * stale-while-revalidate:7 日內嘅 cache 即刻回(app 即開即用);
 * 過咗 1 日就背景刷新,完成後經 onRefresh 靜靜更新 UI。
 * 快取放 IndexedDB(幾 MB,localStorage 會爆);舊 localStorage 資料會自動搬過嚟。
 */
export async function getAllRoutes(onRefresh?: (rs: Route[]) => void): Promise<Route[]> {
  if (routeMem) return routeMem
  // 讀埋過咗 7 日嘅:網絡唔得時仲可以頂住先
  const hit = await cacheGet<Route[]>(ROUTES_KEY, Infinity)
  // 舊版本可能快取咗殘缺清單(例如當時九巴 fetch 失敗)—— 當佢冇,重新攞過
  const cached = hit && hit.data.length > 0 && looksComplete(hit.data) ? hit : null
  if (cached && cached.age < 7 * DAY) {
    const rs = withStaticRoutes(cached.data)
    routeMem = rs
    missing = [] // 快取只會係齊料嗰份(例如另一個分頁啱啱寫咗)→ 唔好留住上次失敗嘅提示
    if (cached.age >= DAY) {
      void fetchAllFresh()
        .then(({ all, miss }) => {
          // 背景刷新唔齊料(例如九巴 timeout)→ 繼續用手上齊料嘅清單,唔好用殘缺嗰份蓋過佢
          if (miss.length || !looksComplete(all)) return
          routeMem = all
          void cachePut(ROUTES_KEY, all)
          onRefresh?.(all)
        })
        .catch(() => {})
    }
    return rs
  }

  let fresh: { all: Route[]; miss: Co[] } | null = null
  try {
    fresh = await fetchAllFresh()
  } catch (e) {
    // 全部失敗(離線):有舊清單就頂住先,冇就照拋錯俾 App 顯示重試
    if (!cached) throw e
  }
  if (fresh && fresh.miss.length === 0 && looksComplete(fresh.all)) {
    missing = []
    routeMem = fresh.all
    void cachePut(ROUTES_KEY, fresh.all) // 齊料先寫快取:殘缺清單一寫落去就會賴足 7 日
    return fresh.all
  }
  // 唔齊料:攞唔到嘅營辦商用舊快取補返(唔寫快取、唔入 routeMem → 下次重試會再 fetch)
  const got = fresh?.all ?? []
  const miss = fresh?.miss ?? ORDER
  const old = cached ? withStaticRoutes(cached.data) : []
  const merged = ORDER.flatMap((co) => (miss.includes(co) ? old : got).filter((r) => r.co === co))
  // 用緊舊資料都照記低:搵唔到新路線時先講得出係「九巴資料攞唔到」,唔係叫人改關鍵字
  missing = [...miss]
  return merged
}

async function fetchAllFresh(): Promise<{ all: Route[]; miss: Co[] }> {
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
  const miss = parts.filter(([, rs]) => !rs?.length).map(([co]) => co)
  const all = parts.flatMap(([, rs]) => rs ?? [])
  // 全部失敗(離線/CORS)→ 唔好快取空陣列毒化一日,直接拋錯俾 App 顯示重試。
  // 英文訊息係刻意:交俾 friendlyError 講「冇網絡連線」/「連唔到伺服器」,App 前綴先唔會重複「載入唔到」
  if (all.length === 0) throw new Error('all route sources failed')
  return { all, miss }
}

// ---- 路線站序 + 站名/座標 ----
export async function getRouteStops(r: Route): Promise<RouteStopInfo[]> {
  if (r.co === 'lrt') {
    return lrRouteStops(r.route, r.bound, r.service_type)
  }
  if (r.co === 'nlb') {
    return nlbRouteStops(r)
  }
  if (r.co === 'gmb') {
    // uid 去程回程共用 → 要連 bound 先攞啱方向
    return r.uid ? gmbRouteStops(r.uid, r.bound) : []
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
    // /eta/{stop}/{route}/{st} 會連埋另一個方向一齊回(總站 / 兩邊共用嘅站)→ 只要本方向
    const data = await kmb.fetchEta(stopId, r.route, r.service_type)
    return data.filter((e) => e.dir === r.bound).map((e) => ({ ...e, co: 'kmb' }))
  }
  if (r.co === 'ctb') {
    return ctb.fetchCtbEta(stopId, r.route, r.bound)
  }
  if (r.co === 'gmb') {
    // GMB uid(gtfsId)就係 etagmb 嘅 route_id(O / I 共用):同一個站同號嘅唔同線(例如 101M 特別班)靠佢分
    return fetchGmbEta(stopId, r.route, r.bound, r.uid)
  }
  if (r.co === 'nlb') {
    const id = nlbRouteId(r, stopId)
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
  return lrtEta(r, stopId)
}

/**
 * 輕鐵:一個站所有月台、所有路綫嘅下一班 → 揀本路綫、本方向(按終點站),按分鐘排好。
 * 同一個站兩邊月台都有同號車(一邊一個方向),淨係對路綫號會撈埋對面嗰啲。
 */
async function lrtEta(r: Route, stopId: string): Promise<Eta[]> {
  const trains = await fetchLrtSchedule(Number(stopId.slice(2)))
  const now = Date.now()
  const base = lrBase(r.route)
  const same = trains.filter((t) => lrBase(t.route) === base)
  const mine = same.filter((t) => lrSameDest(t.destTc, r.dest_tc))
  // 對唔到終點:唔知方向(舊收藏冇目的地)或者冇一班認得(API 寫法唔同)先當晒係本路綫,
  // 免得全部收埋;認得但係去第二度 = 呢個方向暫時冇車。'*' 特別班永遠唔借正常班次嘅車。
  const known = lrKnownDests(r.route)
  const unsure = !r.dest_tc.trim() || !same.some((t) => known.some((d) => lrSameDest(t.destTc, d)))
  const list = mine.length || !unsure || r.route.endsWith('*') ? mine : same
  return [...list]
    .sort((a, b) => a.mins - b.mins)
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
