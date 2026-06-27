// 新大嶼山巴士 (NLB) ETA API
// base: rt.data.gov.hk/v2/transport/nlb(同 CTB 一個 gateway),免 key、CORS。
const BASE = 'https://rt.data.gov.hk/v2/transport/nlb'

export interface NlbArrival {
  eta: string | null // ISO8601
  departed: boolean
  noGps: boolean
}

interface RawArr {
  estimatedArrivalTime?: string
  departed?: string
  noGPS?: string
}

/** 指定 routeId(nlbId)+ stopId 嘅到站時間 */
export async function fetchNlbEta(routeId: string, stopId: string): Promise<NlbArrival[]> {
  const url = `${BASE}/stop.php?action=estimatedArrivals&routeId=${routeId}&stopId=${stopId}&language=zh`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`NLB ${res.status}`)
  const json = (await res.json()) as { estimatedArrivals?: RawArr[] }
  return (json.estimatedArrivals ?? []).map((a) => ({
    // "YYYY-MM-DD HH:mm:ss" 港時,無時區 → 補 +08:00
    eta: a.estimatedArrivalTime
      ? new Date(a.estimatedArrivalTime.replace(' ', 'T') + '+08:00').toISOString()
      : null,
    departed: a.departed === '1',
    noGps: a.noGPS === '1',
  }))
}
