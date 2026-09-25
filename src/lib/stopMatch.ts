// 轉方向(⇄ 返程 / 方向 chip)時,喺對面方向揀返「同一個位」嘅站 + 揀邊條係返程。純函數,有 test。
import { distanceMeters } from './geo'
import type { Route } from '../api/bus'

export interface StopLike {
  stopId: string
  name: string
  lat: number
  lng: number
}

/** 而家打開緊嗰個站(帶過去對面方向搵返佢) */
export interface StopHint {
  stopId?: string
  name: string
  lat: number
  lng: number
}

/** 對面馬路個站通常 100–300 米內;再遠就唔估,寧願唔自動打開 */
export const MATCH_RADIUS_M = 400

/** 站名正規化:去九巴站碼「(KT968)」、空格同括號,大細楷一樣 */
export function normStopName(name: string): string {
  return name
    .replace(/[(（]\s*[A-Z]{1,3}\s?\d{2,4}[A-Z]?\s*[)）]/g, '')
    .replace(/[\s()（）[\]【】]/g, '')
    .toLowerCase()
}

// 城巴站資料攞唔到時座標係 0 → 當冇座標
const hasCoord = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0

/**
 * 喺 stops 入面揀返 hint 對面嗰個站,冇把握就 null(唔自動打開)。
 * 次序:同一個 stopId(輕鐵兩個方向共用站 id)→ maxM 內同名最近 → maxM 內最近。
 */
export function pickCounterpartStop(stops: StopLike[], hint: StopHint, maxM = MATCH_RADIUS_M): string | null {
  if (hint.stopId && stops.some((s) => s.stopId === hint.stopId)) return hint.stopId
  const name = normStopName(hint.name)

  if (!hasCoord(hint.lat, hint.lng)) {
    // 冇座標量唔到距離:同名得一個先當係佢,多過一個唔估
    const same = name ? stops.filter((s) => normStopName(s.name) === name) : []
    return same.length === 1 ? same[0].stopId : null
  }

  let bestSame: { id: string; d: number } | null = null
  let bestAny: { id: string; d: number } | null = null
  for (const s of stops) {
    if (!hasCoord(s.lat, s.lng)) continue
    const d = distanceMeters(hint.lat, hint.lng, s.lat, s.lng)
    if (d > maxM) continue
    if (!bestAny || d < bestAny.d) bestAny = { id: s.stopId, d }
    if (name && normStopName(s.name) === name && (!bestSame || d < bestSame.d)) bestSame = { id: s.stopId, d }
  }
  return (bestSame ?? bestAny)?.id ?? null
}

type VariantLike = Pick<Route, 'co' | 'bound' | 'service_type' | 'orig_tc' | 'dest_tc' | 'uid'>

/**
 * 「⇄ 返程」去邊條:相反方向,優先同一班次(service_type),再揀終點返到而家起點嗰條。
 * 循環線(起點 = 終點)冇返程 → null。
 * GMB 同號跨區會撈埋其他區嘅線:uid(gtfsId)兩個方向共用,所以要同 uid。
 */
export function pickReverseVariant<R extends VariantLike>(route: R, variants: R[]): R | null {
  const from = normStopName(route.orig_tc)
  if (!from || from === normStopName(route.dest_tc)) return null
  const opp = variants.filter(
    (v) => v.bound !== route.bound && (route.co !== 'gmb' || !route.uid || v.uid === route.uid),
  )
  if (!opp.length) return null
  // 同班次最緊要(正常班唔好跳去特別班);再睇終點係咪返到起點
  const score = (v: R) =>
    (v.service_type === route.service_type ? 2 : 0) + (normStopName(v.dest_tc) === from ? 1 : 0)
  return opp.reduce((best, v) => (score(v) > score(best) ? v : best))
}
