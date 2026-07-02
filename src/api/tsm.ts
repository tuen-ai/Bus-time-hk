// 運輸署「交通速度圖」(Traffic Speed Map):主要道路實時車速/飽和度。
// live: resource.data.one.gov.hk/td/speedmap.xml(XML,免 key)
// link 幾何:build-time bake 落 ./tsm/links.json(缺檔 = 功能自動隱藏)。
const LIVE = 'https://resource.data.one.gov.hk/td/speedmap.xml'

export type TsmLevel = 'good' | 'avg' | 'bad'

export interface TsmSeg {
  id: string
  level: TsmLevel
  speed: number // km/h
  path: [number, number][] // [[lat,lng],[lat,lng]]
}

export interface TsmData {
  segs: TsmSeg[]
  capturedAt: string | null // 資料時間(政府提供)
}

type Links = Record<string, [number, number][]>

let linksCache: Promise<Links | null> | null = null

/** link 幾何(same-origin bake 檔;404/冇 bake → null = 隱藏路況圖) */
function loadLinks(): Promise<Links | null> {
  if (!linksCache) {
    linksCache = fetch('./tsm/links.json')
      .then((r) => (r.ok ? (r.json() as Promise<Links>) : null))
      .catch(() => null)
  }
  return linksCache
}

function levelOf(saturation: string): TsmLevel {
  const s = saturation.toUpperCase()
  if (s.includes('BAD')) return 'bad'
  if (s.includes('AVERAGE')) return 'avg'
  return 'good'
}

const pick = (el: Element, tag: string): string =>
  el.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''

let cache: { ts: number; data: TsmData } | null = null
const TTL = 2 * 60 * 1000

/** 攞實時路況(2 分鐘快取)。冇幾何/攞唔到 live → null。 */
export async function fetchTsm(): Promise<TsmData | null> {
  if (cache && Date.now() - cache.ts < TTL) return cache.data
  const links = await loadLinks()
  if (!links) return null
  try {
    const res = await fetch(LIVE, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(String(res.status))
    const doc = new DOMParser().parseFromString(await res.text(), 'application/xml')
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML 解析失敗')
    const segs: TsmSeg[] = []
    let capturedAt: string | null = null
    for (const el of Array.from(doc.getElementsByTagName('jtis_speedmap'))) {
      const id = pick(el, 'LINK_ID')
      const path = links[id]
      if (!path) continue
      capturedAt ||= pick(el, 'CAPTURE_DATE') || null
      segs.push({
        id,
        level: levelOf(pick(el, 'ROAD_SATURATION_LEVEL')),
        speed: Number(pick(el, 'TRAFFIC_SPEED')) || 0,
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
