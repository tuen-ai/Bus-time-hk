// 輕鐵 (MTR Light Rail) 即時下一班 Next Train API
// 文件: https://opendata.mtr.com.hk/doc/LR_Next_Train_API_Spec_v1.1.pdf
// endpoint: getSchedule?station_id={純數字}&with_special=1,免 key、CORS。
const BASE = 'https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule'

export interface LrTrain {
  route: string // route_no,如 505 / 761P
  destTc: string
  mins: number // 0 = 即將抵達/開出
  platform: string
}

interface RawTrain {
  route_no?: string
  dest_ch?: string
  time_ch?: string
  time_en?: string
}
interface RawPlatform {
  platform_id?: number
  route_list?: RawTrain[]
}
interface RawResp {
  status?: number
  system_time?: string
  platform_list?: RawPlatform[]
}

/** "5 min" / "5 分鐘" / "-" / "Arriving" / "Departing" → 分鐘(非數字當 0) */
function parseMins(t: string | undefined): number {
  if (!t) return 0
  const m = t.match(/\d+/)
  return m ? Number(m[0]) : 0
}

/** 取得一個輕鐵站所有月台、所有路綫嘅下一班 */
export async function fetchLrtSchedule(stationId: number): Promise<LrTrain[]> {
  const res = await fetch(`${BASE}?station_id=${stationId}&with_special=1`)
  if (!res.ok) throw new Error(`LRT ${res.status}`)
  const json = (await res.json()) as RawResp
  if (json.status === 0) return []
  const out: LrTrain[] = []
  for (const p of json.platform_list ?? []) {
    for (const t of p.route_list ?? []) {
      out.push({
        route: String(t.route_no ?? ''),
        destTc: String(t.dest_ch ?? ''),
        mins: parseMins(t.time_ch || t.time_en),
        platform: String(p.platform_id ?? ''),
      })
    }
  }
  return out
}
