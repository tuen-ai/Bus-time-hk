// KMB / 龍運巴士 (LWB) Open Data API client
// 文件: https://data.gov.hk/tc-data/dataset/hk-td-tis_21-etakmb
// API base 無需 API key、支援 CORS,可由 browser 直接呼叫。

const BASE = 'https://data.etabus.gov.hk/v1/transport/kmb'

export type Direction = 'inbound' | 'outbound'

export interface Route {
  route: string
  bound: 'I' | 'O'
  service_type: string
  orig_en: string
  orig_tc: string
  orig_sc: string
  dest_en: string
  dest_tc: string
  dest_sc: string
}

export interface Stop {
  stop: string
  name_en: string
  name_tc: string
  name_sc: string
  lat: string
  long: string
}

export interface RouteStop {
  route: string
  bound: 'I' | 'O'
  service_type: string
  seq: string
  stop: string
}

export interface Eta {
  co: string
  route: string
  dir: 'I' | 'O'
  service_type: number
  seq: number
  dest_tc: string
  dest_en: string
  dest_sc: string
  eta_seq: number
  eta: string | null
  rmk_tc: string
  rmk_en: string
  rmk_sc: string
  data_timestamp: string
}

interface ApiEnvelope<T> {
  type: string
  version: string
  generated_timestamp: string
  data: T
}

async function get<T>(path: string): Promise<ApiEnvelope<T>> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    throw new Error(`API 錯誤 (${res.status}): ${path}`)
  }
  return res.json() as Promise<ApiEnvelope<T>>
}

export const dirParam = (bound: 'I' | 'O'): Direction =>
  bound === 'I' ? 'inbound' : 'outbound'

/** 全部路線清單 */
export async function fetchRoutes(): Promise<Route[]> {
  return (await get<Route[]>('/route/')).data
}

/** 全部站點清單(資料量大,建議緩存) */
export async function fetchStops(): Promise<Stop[]> {
  return (await get<Stop[]>('/stop')).data
}

/** 指定路線 / 方向 / 班次 經過嘅站序 */
export async function fetchRouteStops(
  route: string,
  bound: 'I' | 'O',
  serviceType: string,
): Promise<RouteStop[]> {
  return (
    await get<RouteStop[]>(
      `/route-stop/${route}/${dirParam(bound)}/${serviceType}`,
    )
  ).data
}

/** 指定站 + 路線 + 班次 嘅到站時間 */
export async function fetchEta(
  stopId: string,
  route: string,
  serviceType: string,
): Promise<Eta[]> {
  return (await get<Eta[]>(`/eta/${stopId}/${route}/${serviceType}`)).data
}

/** 一個站所有路線嘅到站時間 */
export async function fetchStopEta(stopId: string): Promise<Eta[]> {
  return (await get<Eta[]>(`/stop-eta/${stopId}`)).data
}
