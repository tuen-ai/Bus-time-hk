// 行程規劃路線圖:離線 route↔stop 圖 + 站座標 + grid 空間索引。
// 資料大(~1.9MB)→ 動態 import,只喺規劃時載入一次。
import { distanceMeters } from './geo'

export interface PlanRoute {
  k: string // co|route|bound|serviceType
  co: string
  r: string
  b: 'I' | 'O'
  s: string
  o: string
  d: string
  jt: number | null // 全程行車時間(分鐘)
  st: string[] // 站序(stopId)
}
export interface PlanGraph {
  routes: PlanRoute[]
  stops: Record<string, [number, number, string]> // id -> [lat, lng, nameTc]
}

export const stopName = (g: PlanGraph, id: string): string => g.stops[id]?.[2] ?? id

export interface Indexed {
  graph: PlanGraph
  routeByIdx: PlanRoute[] // index = route 編號
  stopRoutes: Map<string, { ri: number; seq: number }[]> // stopId -> 經過嘅路線+站序
  grid: Map<string, string[]> // gridKey -> stopIds
}

const CELL = 0.0045 // ~500m
const gridKey = (lat: number, lng: number) =>
  `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`

let cache: Promise<Indexed> | null = null

export function loadGraph(): Promise<Indexed> {
  if (!cache) {
    cache = import('../data/planGraph.json').then((m) => buildIndex(m.default as unknown as PlanGraph))
  }
  return cache
}

function buildIndex(graph: PlanGraph): Indexed {
  const routeByIdx = graph.routes
  const stopRoutes = new Map<string, { ri: number; seq: number }[]>()
  for (let ri = 0; ri < routeByIdx.length; ri++) {
    const st = routeByIdx[ri].st
    for (let seq = 0; seq < st.length; seq++) {
      const id = st[seq]
      let arr = stopRoutes.get(id)
      if (!arr) stopRoutes.set(id, (arr = []))
      arr.push({ ri, seq })
    }
  }
  const grid = new Map<string, string[]>()
  for (const id in graph.stops) {
    const [lat, lng] = graph.stops[id]
    const key = gridKey(lat, lng)
    let arr = grid.get(key)
    if (!arr) grid.set(key, (arr = []))
    arr.push(id)
  }
  return { graph, routeByIdx, stopRoutes, grid }
}

/** 半徑內最近嘅站(用 grid,封頂 limit 個) */
export function nearStops(
  ix: Indexed,
  lat: number,
  lng: number,
  radiusM = 500,
  limit = 16,
): { id: string; dist: number }[] {
  const cells = Math.ceil(radiusM / 1000 / CELL) + 1
  const cLat = Math.floor(lat / CELL)
  const cLng = Math.floor(lng / CELL)
  const out: { id: string; dist: number }[] = []
  for (let dx = -cells; dx <= cells; dx++) {
    for (let dy = -cells; dy <= cells; dy++) {
      const ids = ix.grid.get(`${cLat + dx}:${cLng + dy}`)
      if (!ids) continue
      for (const id of ids) {
        const [slat, slng] = ix.graph.stops[id]
        const dist = distanceMeters(lat, lng, slat, slng)
        if (dist <= radiusM) out.push({ id, dist })
      }
    }
  }
  return out.sort((a, b) => a.dist - b.dist).slice(0, limit)
}
