// 運輸署「特別交通消息」Special Traffic News(事故/封路/改道/擠塞)
// feed: resource.data.one.gov.hk/td/tc/specialtrafficnews.xml(XML,免 key)
// 多數消息只有「地區」無座標 → 只能做地區層級比對。
import { memoAsync } from '../lib/cache'

const FEED = 'https://resource.data.one.gov.hk/td/tc/specialtrafficnews.xml'

export interface Notice {
  id: string
  status: string
  heading: string
  detail: string
  date: string
  districts: string[]
}

const TTL = 3 * 60 * 1000

// 喺一個 element 入面,順序試多個 tag 名,取第一個有值嘅
function pick(el: Element, names: string[]): string {
  for (const n of names) {
    const node = el.getElementsByTagName(n)[0]
    if (node && node.textContent && node.textContent.trim()) return node.textContent.trim()
  }
  return ''
}

function parse(xml: string): Notice[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) return []
  const msgs = Array.from(doc.getElementsByTagName('message'))
  return msgs.map((m) => {
    const districts: string[] = []
    for (const d of Array.from(m.getElementsByTagName('District'))) {
      const t = d.textContent?.trim()
      if (t) districts.push(t)
    }
    const dcn = pick(m, ['DISTRICT_CN', 'DISTRICT'])
    if (dcn && districts.length === 0) districts.push(...dcn.split(/[、,，]/).map((s) => s.trim()))
    return {
      id: pick(m, ['msgID', 'INCIDENT_NUMBER']),
      status: pick(m, ['CurrentStatus', 'INCIDENT_STATUS', 'CURRENT_STATUS']),
      heading: pick(m, ['ChinShort', 'INCIDENT_HEADING_CN', 'HEADING_CN']),
      detail: pick(m, ['ChinText', 'INCIDENT_DETAIL_CN', 'CONTENT_CN', 'ChinShort']),
      date: pick(m, ['ReferenceDate', 'ANNOUNCEMENT_DATE', 'AnnouncementDate']),
      districts,
    }
  })
}

/** 取得現時生效嘅特別交通消息(3 分鐘快取;路線頁 + 地圖同時要都只 fetch 一次)。
 *  失敗回空陣列(graceful)。 */
export const fetchTrafficNews: () => Promise<Notice[]> = memoAsync(
  () =>
    fetch(FEED, { signal: AbortSignal.timeout(15000) })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.text()
      })
      .then((xml) => parse(xml).filter((n) => n.detail || n.heading))
      .catch(() => [] as Notice[]),
  TTL,
)
