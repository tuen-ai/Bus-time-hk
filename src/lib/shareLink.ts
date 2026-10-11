// 分享連結:#r=<co>/<route>/<bound>/<serviceType>[/<stopId>][&u=<uid>]
// 例:https://tuen-ai.github.io/Bus-time-hk/#r=kmb/1A/O/1/18492910339410B1
// 用 hash 唔用 path / query:GitHub Pages 子目錄(/Bus-time-hk/)唔使 404 fallback,SW 導航照用快取外殼。
// 綠van / 嶼巴同號跨區要 uid 先分得開 → 放 &u=。
// 另外 #tab=<nearby|mtr|plan|search|favs>:主畫面捷徑(manifest shortcuts)直達分頁。
import { coLabel, type Co, type RouteQuery } from '../api/bus'

export type RouteLink = RouteQuery & { stopId?: string }

const COS: readonly Co[] = ['kmb', 'ctb', 'lrt', 'nlb', 'gmb']
export const ROUTE_PREFIX = '#r='
export const TAB_PREFIX = '#tab='
export type LinkTab = 'search' | 'nearby' | 'mtr' | 'plan' | 'favs'
const TABS: readonly LinkTab[] = ['search', 'nearby', 'mtr', 'plan', 'favs']

const enc = encodeURIComponent
const dec = (s: string): string | null => {
  try {
    return decodeURIComponent(s)
  } catch {
    return null
  }
}

/** Route key(+站)→ hash(包 # 號) */
export function routeHash(q: RouteLink): string {
  const parts = [q.co, q.route, q.bound, q.serviceType, ...(q.stopId ? [q.stopId] : [])].map(enc)
  return `${ROUTE_PREFIX}${parts.join('/')}${q.uid ? `&u=${enc(q.uid)}` : ''}`
}

export type ParsedHash =
  { kind: 'route'; link: RouteLink } | { kind: 'tab'; tab: LinkTab } | { kind: 'invalid' } | null

/** 解 hash;唔關分享連結事(例如 #display、冇 hash)回 null;係分享連結但壞咗回 invalid */
export function parseHash(hash: string): ParsedHash {
  if (hash.startsWith(TAB_PREFIX)) {
    const t = hash.slice(TAB_PREFIX.length) as LinkTab
    return TABS.includes(t) ? { kind: 'tab', tab: t } : { kind: 'invalid' }
  }
  if (!hash.startsWith(ROUTE_PREFIX)) return null
  const [path, ...params] = hash.slice(ROUTE_PREFIX.length).split('&')
  const segs = path.split('/').map(dec)
  if (segs.length < 4 || segs.length > 5 || segs.some((s) => s == null || s.trim() === '')) {
    return { kind: 'invalid' }
  }
  const [co, route, bound, serviceType, stopId] = segs as string[]
  if (!COS.includes(co as Co) || (bound !== 'I' && bound !== 'O') || route.length > 12) {
    return { kind: 'invalid' }
  }
  let uid: string | undefined
  for (const p of params) {
    if (p.startsWith('u=')) uid = dec(p.slice(2)) || undefined
  }
  const link: RouteLink = { co: co as Co, route, bound, serviceType }
  if (stopId) link.stopId = stopId
  if (uid) link.uid = uid
  return { kind: 'route', link }
}

/** 完整分享網址:保留而家嘅 origin + 子目錄(GitHub Pages /Bus-time-hk/),換走 hash */
export function shareUrl(q: RouteLink, loc: Pick<Location, 'origin' | 'pathname'> = window.location): string {
  return `${loc.origin}${loc.pathname}${routeHash(q)}`
}

/** 分享標題:可可出行 · 九巴 1A 往中秀茂坪 · 尖沙咀站 */
export function shareTitle(q: { co: Co; route: string; dest?: string }, stopName?: string): string {
  const head = `${coLabel(q.co)} ${q.route}${q.dest ? ` 往${q.dest}` : ''}`
  return ['可可出行', head, ...(stopName ? [stopName] : [])].join(' · ')
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

/** 有 Web Share 就彈系統分享;冇(桌面瀏覽器)/ 失敗就抄去剪貼簿 */
export async function shareOrCopy(title: string, url: string): Promise<ShareResult> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title, text: title, url })
      return 'shared'
    } catch (e) {
      // 用家自己閂咗分享面板:唔使再抄
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled'
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
