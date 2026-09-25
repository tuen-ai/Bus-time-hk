// 路線搜尋:純函數,方便測試同重用(SearchView 用)。
import type { Co, Route } from '../api/bus'

export const MAX_RESULTS = 200

// 同一個路線號好多時幾間營辦商都有(例如 38:九巴 葵盛東↔平田、城巴 置富↔北角碼頭、
// 綠van 元朗、嶼巴 東涌)。以前排序用 co 字母序,ctb / gmb 排晒喺 kmb 前面 —— 搵「38」
// 要碌到第 9 個先見到九巴,喺手機上面已經跌出屏幕,用戶以為冇咗呢條線。
// 九巴線最多(約 1500 條,覆蓋九龍 + 新界),所以同號時排第一;想淨睇其他營辦商,
// 撳上面嘅營辦商 chip,或者直接打「城巴38」。
const CO_RANK: Record<Co, number> = { kmb: 0, ctb: 1, nlb: 2, gmb: 3, lrt: 4 }

/** 營辦商叫法 → co:打「九巴38」「城巴1」「ctb 1」都搵到 */
const CO_ALIAS: [RegExp, Co][] = [
  [/^(?:九巴|龍運|kmb|lwb)/i, 'kmb'],
  [/^(?:城巴|新巴|ctb|nwfb)/i, 'ctb'],
  [/^(?:嶼巴|新大嶼山巴士|nlb)/i, 'nlb'],
  [/^(?:綠van|綠小|專線小巴|小巴|gmb)/i, 'gmb'],
  [/^(?:輕鐵|lrt)/i, 'lrt'],
]

/** 全形英數 → 半形(手機中文輸入法好易打到全形「４２Ｃ」) */
const halfWidth = (s: string): string =>
  s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

const noSpace = (s: string): string => s.replace(/\s+/g, '')

// 路線號 numeric 排序(38 < 38A < 118)。共用一個 Collator —— 每次 localeCompare 帶 options
// 都要重新 set up ICU,排 1600 條九巴線慢廿幾倍,打字會 lag。
const routeCollator = new Intl.Collator(undefined, { numeric: true })
// bound(I/O)同 service_type(數字字串)係 ASCII,直接比較就夠
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** 排序:路線號 → 同號九巴先 → 方向 → 班次 */
export const compareRoutes = (a: Route, b: Route): number =>
  // 路線號(numeric:38 排喺 38A 前,所以完全相符嘅永遠喺最前)
  routeCollator.compare(a.route, b.route) ||
  CO_RANK[a.co] - CO_RANK[b.co] ||
  cmp(a.bound, b.bound) ||
  cmp(a.service_type, b.service_type)

export interface ParsedQuery {
  /** 路線號或地名(已去空格 / 全形 / 大楷化) */
  text: string
  /** 查詢字入面講明嘅營辦商,例如「九巴38」→ kmb */
  co: Co | null
}

/** 拆解用戶輸入:抽出營辦商前綴、去掉「號 / 線」尾綴、正規化 */
export function parseQuery(query: string): ParsedQuery {
  let s = halfWidth(query).trim()
  let co: Co | null = null
  for (const [re, c] of CO_ALIAS) {
    if (re.test(s)) {
      co = c
      s = s.replace(re, '').trim()
      break
    }
  }
  s = s.replace(/[號号線线]+$/, '') // 「38號」「42C線」
  return { text: noSpace(s).toUpperCase(), co }
}

export function searchRoutes(routes: Route[], query: string, coFilter: Co | 'all' = 'all'): Route[] {
  const { text, co } = parseQuery(query)
  // 查詢字講明咗營辦商就跟佢,否則跟上面嘅 chip
  const wantCo = co ?? (coFilter === 'all' ? null : coFilter)
  if (!text && !wantCo) return []

  // 純英數 = 路線號 prefix;有中文 / 其他字 = 搵目的地或起點站名
  const byNumber = text !== '' && /^[A-Z0-9]+$/.test(text)
  return routes
    .filter((r) => {
      if (wantCo && r.co !== wantCo) return false
      if (!text) return true // 淨係打咗營辦商(例如「城巴」)→ 列晒佢嘅路線
      return byNumber
        ? r.route.toUpperCase().startsWith(text)
        : noSpace(r.dest_tc).includes(text) || noSpace(r.orig_tc).includes(text)
    })
    .sort(compareRoutes)
    .slice(0, MAX_RESULTS)
}

/** 一條路線(連 GMB 分區 uid)嘅身份字串:結果卡 key + 返嚟時搵返張卡 */
export const routeIdentity = (r: Route): string =>
  `${r.co}|${r.route}|${r.bound}|${r.service_type}|${r.uid ?? ''}`

/** 結果卡 React key:用路線身份(唔用 index),清單移位時卡可以重用;
 *  上游偶然有完全重複嘅行,就加 #1、#2 分開 */
export function resultKeys(routes: Route[]): string[] {
  const seen = new Map<string, number>()
  return routes.map((r) => {
    const base = routeIdentity(r)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n ? `${base}#${n}` : base
  })
}
