// 港鐵 (MTR) 重鐵實時下一班列車 (Next Train) API
// 文件: https://data.gov.hk/tc-data/dataset/mtr-data2-nexttrain-data
// endpoint: getSchedule.php?line={LINE}&sta={STATION}&lang=tc
// 免 key、免費、支援 CORS。
const BASE = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php'

export interface TrainArrival {
  dest: string // 目的地車站代碼
  plat: string // 月台
  ttnt: number // time to next train(分鐘)
  time: string // 預計到達時間
  seq: number
}

export interface StationSchedule {
  up: TrainArrival[] // 上行 / 往……
  down: TrainArrival[] // 下行
  sysTime: string | null
  isDelay: boolean
}

interface RawTrain {
  dest?: string
  plat?: string
  ttnt?: string
  time?: string
  seq?: string
}

interface RawResp {
  status?: number
  curr_time?: string
  sys_time?: string
  isdelay?: string
  data?: Record<string, { UP?: RawTrain[]; DOWN?: RawTrain[] }>
}

function mapTrains(list: RawTrain[] | undefined): TrainArrival[] {
  return (list ?? [])
    .map((t) => ({
      dest: String(t.dest ?? ''),
      plat: String(t.plat ?? ''),
      ttnt: Number(t.ttnt ?? 0),
      time: String(t.time ?? ''),
      seq: Number(t.seq ?? 0),
    }))
    .sort((a, b) => a.seq - b.seq)
}

/** 取得指定線 + 站嘅上行/下行下一班列車 */
export async function fetchSchedule(line: string, station: string): Promise<StationSchedule> {
  const res = await fetch(`${BASE}?line=${line}&sta=${station}&lang=tc`)
  if (!res.ok) throw new Error(`MTR ${res.status}`)
  const json = (await res.json()) as RawResp
  const node = json.data?.[`${line}-${station}`]
  return {
    up: mapTrains(node?.UP),
    down: mapTrains(node?.DOWN),
    sysTime: json.sys_time ?? null,
    isDelay: json.isdelay === 'true',
  }
}
