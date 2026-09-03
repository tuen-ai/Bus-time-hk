// 路線搜尋:純函數,方便測試同重用(SearchView 用)。
import type { Co, Route } from '../api/bus'

export const MAX_RESULTS = 80

/** 純英數 = 路線號 prefix;有中文 / 其他字 = 搵目的地或起點站名 */
export function searchRoutes(routes: Route[], query: string, coFilter: Co | 'all' = 'all'): Route[] {
  const raw = query.trim()
  const q = raw.toUpperCase()
  if (!q) return []
  const byNumber = /^[A-Z0-9]+$/.test(q)
  return routes
    .filter((r) =>
      byNumber ? r.route.toUpperCase().startsWith(q) : r.dest_tc.includes(raw) || r.orig_tc.includes(raw),
    )
    .filter((r) => coFilter === 'all' || r.co === coFilter)
    .sort(
      (a, b) =>
        a.route.localeCompare(b.route, undefined, { numeric: true }) ||
        a.co.localeCompare(b.co) ||
        a.bound.localeCompare(b.bound) ||
        a.service_type.localeCompare(b.service_type),
    )
    .slice(0, MAX_RESULTS)
}
