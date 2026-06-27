// 由 ETA 推算巴士喺路線上嘅位置(無 GPS,純推算,僅供參考)。
import nearestPointOnLine from '@turf/nearest-point-on-line'
import along from '@turf/along'
import { point } from '@turf/helpers'
import type { Feature, LineString } from 'geojson'

export interface SnappedStop {
  seq: number
  lat: number
  lng: number
  dist: number // 沿線累積距離(km)
}

/** 將每個站 snap 落折線,計算沿線累積距離;強制按 seq 單調遞增(處理循環線) */
export function snapStops(
  line: Feature<LineString>,
  stops: { seq: number; lat: number; lng: number }[],
): SnappedStop[] {
  const sorted = [...stops].sort((a, b) => a.seq - b.seq)
  const out: SnappedStop[] = []
  let prevDist = 0
  for (const s of sorted) {
    const snapped = nearestPointOnLine(line, point([s.lng, s.lat]))
    let d = (snapped.properties.location as number) ?? prevDist
    if (d < prevDist) d = prevDist + 0.0005 // 單調遞增,避免循環線跳前
    prevDist = d
    out.push({ seq: s.seq, lat: s.lat, lng: s.lng, dist: d })
  }
  return out
}

export interface PredictedBus {
  lat: number
  lng: number
  minsToNext: number
}

const DEFAULT_SEG_MS = 90_000
const MAX_BUSES = 3

/**
 * 推算路線上嘅巴士位置。
 * - etaBySeq: 每個 seq 嘅 eta_seq=1 到站時間
 * - 沿 seq 升序 walk,時間單調遞增 = 同一架車;時間下降即斷鏈(分開不同車)
 * - 每條鏈第一個未來站之前嘅弧段,按已過時間比例內插
 */
export function predictBuses(
  line: Feature<LineString>,
  snapped: SnappedStop[],
  etaBySeq: Map<number, number>,
  now: number,
): PredictedBus[] {
  const pts = snapped
    .map((s) => ({ ...s, t: etaBySeq.get(s.seq) }))
    .filter((s): s is SnappedStop & { t: number } => s.t != null && s.t > now)

  // 分鏈
  const chains: (SnappedStop & { t: number })[][] = []
  let cur: (SnappedStop & { t: number })[] = []
  for (const p of pts) {
    if (cur.length === 0 || p.t > cur[cur.length - 1].t) {
      cur.push(p)
    } else {
      chains.push(cur)
      cur = [p]
    }
  }
  if (cur.length) chains.push(cur)

  const buses: PredictedBus[] = []
  for (const chain of chains.slice(0, MAX_BUSES)) {
    const first = chain[0]
    const prev = lastBefore(snapped, first.seq)
    const segDur = chain.length >= 2 ? chain[1].t - chain[0].t : DEFAULT_SEG_MS
    const prevDist = prev ? prev.dist : Math.max(0, first.dist - 0.3)
    const departPrev = first.t - segDur
    const frac = clamp((now - departPrev) / segDur, 0, 1)
    const busDist = prevDist + frac * (first.dist - prevDist)
    const pos = along(line, busDist)
    const [lng, lat] = pos.geometry.coordinates
    buses.push({ lat, lng, minsToNext: Math.round((first.t - now) / 60_000) })
  }
  return buses
}

function lastBefore(stops: SnappedStop[], seq: number): SnappedStop | null {
  let best: SnappedStop | null = null
  for (const s of stops) {
    if (s.seq < seq && (!best || s.seq > best.seq)) best = s
  }
  return best
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
