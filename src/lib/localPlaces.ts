// 本地地標建議(港鐵 / 輕鐵站):即時、離線,做 autocomplete 第一層。
import { MTR_LINES } from './mtrData'
import lr from '../data/lrData.json'
import type { GeoPlace } from '../api/geocode'

const index: GeoPlace[] = (() => {
  const out: GeoPlace[] = []
  const seen = new Set<string>()
  for (const line of MTR_LINES) {
    for (const s of line.stations) {
      if (s.lat == null || s.lng == null || seen.has(s.code)) continue
      seen.add(s.code)
      out.push({ label: `${s.nameTc}站`, sub: '港鐵', lat: s.lat, lng: s.lng })
    }
  }
  const stops = (lr as { stops: Record<string, { n: string; lat: number; lng: number }> }).stops
  const seenLr = new Set<string>()
  for (const id in stops) {
    const st = stops[id]
    if (seenLr.has(st.n)) continue
    seenLr.add(st.n)
    out.push({ label: `${st.n}站`, sub: '輕鐵', lat: st.lat, lng: st.lng })
  }
  return out
})()

/** 本地車站名包含 query 嘅建議 */
export function localPlaces(q: string): GeoPlace[] {
  const s = q.trim()
  if (!s) return []
  return index.filter((p) => p.label.includes(s)).slice(0, 6)
}
