// 運輸署「策略性/主要道路交通數據」(TSM):路段實時車速/飽和度。
// 路段幾何 + 實時 XML URL:build-time bake 落 ./tsm/(缺檔 = 功能自動隱藏)。
// XML 兼容一代(jtis_speedmap/LINK_ID)同二代(segment/SEGMENT_ID)欄位。
import { HttpError, fetchJson, fetchWithTimeout } from '../lib/http'

const DEFAULT_LIVE = 'https://resource.data.one.gov.hk/td/speedmap.xml'

export type TsmLevel = 'good' | 'avg' | 'bad'

export interface TsmSeg {
  id: string
  level: TsmLevel
  speed: number // km/h
  path: [number, number][] // [[lat,lng],...]
}

export interface TsmData {
  segs: TsmSeg[]
  capturedAt: string | null // 資料時間(政府提供)
}

type Links = Record<string, [number, number][]>

let bakeCache: Promise<{ links: Links; live: string } | null> | null = null

/** bake 檔(same-origin;404/冇 bake → null = 隱藏路況圖;斷線/逾時 → 今次 null,下次再試) */
function loadBaked(): Promise<{ links: Links; live: string } | null> {
  if (!bakeCache) {
    bakeCache = (async () => {
      try {
        const links = await fetchJson<Links>('./tsm/links.json')
        let live = DEFAULT_LIVE
        try {
          live = (await fetchJson<{ live?: string }>('./tsm/meta.json')).live ?? DEFAULT_LIVE
        } catch {
          /* 用預設 */
        }
        return { links, live }
      } catch (e) {
        // 404 / 壞 JSON = 冇 bake,記住唔再試;斷線(TypeError)/ 逾時唔好記死,下個 tick 重試
        const transient = e instanceof TypeError || (e as { name?: string } | null)?.name === 'TimeoutError'
        if (transient) bakeCache = null
        return null
      }
    })()
  }
  return bakeCache
}

/** 冇飽和度欄位時由車速估(市區限速 ~50km/h) */
function levelOf(saturation: string, speed: number): TsmLevel {
  const s = saturation.toUpperCase()
  if (s.includes('BAD')) return 'bad'
  if (s.includes('AVERAGE')) return 'avg'
  if (s.includes('GOOD')) return 'good'
  if (speed >= 40) return 'good'
  if (speed >= 20) return 'avg'
  return 'bad'
}

function pick(el: Element, tags: string[]): string {
  for (const t of tags) {
    const v = el.getElementsByTagName(t)[0]?.textContent?.trim()
    if (v) return v
  }
  return ''
}

let cache: { ts: number; data: TsmData } | null = null
// 面板每 2 分鐘 tick 一次;TTL 要短過 tick 週期,否則 tick 會攞 stale cache
const TTL = 90 * 1000

/** 攞實時路況(2 分鐘快取)。冇幾何/攞唔到 live → null。 */
export async function fetchTsm(): Promise<TsmData | null> {
  if (cache && Date.now() - cache.ts < TTL) return cache.data
  const baked = await loadBaked()
  if (!baked) return null
  try {
    const res = await fetchWithTimeout(baked.live, { timeoutMs: 15_000 })
    if (!res.ok) throw new HttpError(res.status, baked.live)
    const doc = new DOMParser().parseFromString(await res.text(), 'application/xml')
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML 解析失敗')
    // 一代 jtis_speedmap;二代 segment
    let els = Array.from(doc.getElementsByTagName('jtis_speedmap'))
    if (!els.length) els = Array.from(doc.getElementsByTagName('segment'))
    if (!els.length) els = Array.from(doc.getElementsByTagName('SEGMENT'))
    const segs: TsmSeg[] = []
    let capturedAt: string | null = null
    for (const el of els) {
      const valid = pick(el, ['VALID', 'valid'])
      if (valid && valid.toUpperCase() === 'N') continue
      const id = pick(el, ['LINK_ID', 'SEGMENT_ID', 'segment_id', 'link_id', 'id'])
      const path = baked.links[id]
      if (!path) continue
      capturedAt ||= pick(el, ['CAPTURE_DATE', 'capture_date', 'CAPTURE_TIME']) || null
      const speed = Number(pick(el, ['TRAFFIC_SPEED', 'traffic_speed', 'speed'])) || 0
      segs.push({
        id,
        level: levelOf(pick(el, ['ROAD_SATURATION_LEVEL', 'road_saturation_level', 'saturation']), speed),
        speed,
        path,
      })
    }
    if (!segs.length) throw new Error('冇對到任何 link')
    const data = { segs, capturedAt }
    cache = { ts: Date.now(), data }
    return data
  } catch {
    return cache?.data ?? null
  }
}
