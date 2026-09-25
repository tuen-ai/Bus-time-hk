// 地點 type-ahead:本地車站即時出 + 地理編碼(debounce)補上。
// geocode 最長會拖成 20 幾秒(ALS 兩個 host + Photon)—— 舊 query 遲返嘅結果一律作廢,
// 唔准覆蓋新結果,亦唔准喺揀咗之後再彈返個 list 出嚟。
import { useEffect, useState } from 'react'
import { geocode, type GeoPlace } from '../api/geocode'
import { localPlaces } from '../lib/localPlaces'

const DEBOUNCE_MS = 350
const MAX_RESULTS = 8

/** 本地建議排先,geocode 同名嘅唔重複,最多 8 個 */
export function mergePlaces(local: GeoPlace[], geo: GeoPlace[]): GeoPlace[] {
  const merged = [...local]
  for (const g of geo) {
    if (merged.length >= MAX_RESULTS) break
    if (!merged.some((m) => m.label === g.label)) merged.push(g)
  }
  return merged
}

/**
 * @param q      搜尋字
 * @param paused true = 已經揀咗(唔再搜、清走建議)
 */
export function usePlaceSearch(q: string, paused: boolean): { results: GeoPlace[]; searching: boolean } {
  const [results, setResults] = useState<GeoPlace[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const s = q.trim()
    if (paused || !s) {
      setResults([])
      return
    }
    const local = localPlaces(s)
    setResults(local)
    setSearching(true)
    let alive = true
    const t = setTimeout(async () => {
      const geo = await geocode(s) // 唔會 throw(失敗回 [])
      if (!alive) return // 打咗新字 / 揀咗 / 清咗 / 閂咗:舊結果作廢
      setResults(mergePlaces(local, geo))
      setSearching(false)
    }, DEBOUNCE_MS)
    return () => {
      alive = false
      clearTimeout(t)
      setSearching(false) // 同下一輪嘅 setSearching(true) 同一個 commit,唔會閃
    }
  }, [q, paused])

  return { results, searching }
}
