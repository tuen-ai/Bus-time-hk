// 新版本提示 + chunk 載入失敗自救(main.tsx / ErrorBoundary / UpdateToast 共用)。
// 部署之後,開住嘅舊 tab 仲係舊 build:新 SW 接手就提示「有新版本」;
// 真係攞唔到舊 chunk(server 已經冇咗)就自動 reload 一次,sessionStorage 時間戳防 loop。
import { fetchWithTimeout } from './http'

const RELOAD_KEY = 'kkcx.autoReloadAt'
/** 自動 reload 最多每 10 分鐘一次:server 真係壞咗都唔會 reload 到停唔到 */
export const AUTO_RELOAD_GAP_MS = 10 * 60_000

let reloading = false

/** 自動 reload 一次;10 分鐘內 reload 過(或者冇 sessionStorage)就唔做,回 false */
export function reloadOnce(reload: () => void = () => window.location.reload(), now = Date.now()): boolean {
  if (reloading) return true // 已經 reload 緊
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? NaN)
    if (now >= last && now - last < AUTO_RELOAD_GAP_MS) return false // NaN(未 reload 過)比較一律 false
    sessionStorage.setItem(RELOAD_KEY, String(now))
  } catch {
    return false // 私密模式 / 封鎖 storage:冇得防 loop 就唔好自動 reload
  }
  reloading = true
  reload()
  return true
}

/** 已經觸發咗自動 reload(等緊新頁面) */
export const isReloading = (): boolean => reloading

// Chrome / Firefox / Safari 各自嘅 dynamic import 失敗訊息,加埋 Vite lazy CSS preload 失敗
const CHUNK_RE =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch dynamically|Unable to preload CSS/i

/** 係咪「lazy chunk 載入失敗」(部署咗新版 / 網絡斷咗)而唔係 code bug */
export function isChunkError(e: unknown): boolean {
  const msg = typeof e === 'string' ? e : (e as { message?: unknown } | null)?.message
  return typeof msg === 'string' && CHUNK_RE.test(msg)
}

// ---- 新版本狀態(UpdateToast 用 useSyncExternalStore 訂閱)----

/** 新版就緒時 window 會收到呢個 event(例如顯示模式想閒置時自動 reload) */
export const UPDATE_EVENT = 'kkcx:update'

let updateReady = false
const listeners = new Set<() => void>()

/** 新版 SW 已經接手而呢頁仲係舊 build → 通知 UpdateToast 同 window 'kkcx:update' */
export function markUpdateReady(): void {
  if (updateReady) return
  updateReady = true
  listeners.forEach((l) => l())
  window.dispatchEvent(new Event(UPDATE_EVENT))
}

export const isUpdateReady = (): boolean => updateReady

export function onUpdateReady(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

// ---- 判斷頁面係咪已經係新 build ----

const ASSET_RE = /assets\/[^"'?#\s]+/

/** index.html 引用嘅 ./assets/ 檔(entry JS、CSS、modulepreload) */
export function shellAssets(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const a = m[1].match(ASSET_RE)?.[0]
    if (a) out.push(a)
  }
  return out
}

/** 新外殼引用嘅 assets 頁面全部都載咗 = 同一個 build;抽唔到(例如 dev)就當唔同,寧可提示 */
export function isSameBuild(shellHtml: string, pageUrls: string[]): boolean {
  const need = shellAssets(shellHtml)
  if (!need.length) return false
  const have = new Set(pageUrls.map((u) => u.match(ASSET_RE)?.[0]))
  return need.every((a) => have.has(a))
}

/** 頁面而家用緊嘅 script / link 網址(包括之後 lazy 載入嘅 chunk / CSS) */
const pageUrls = (): string[] =>
  Array.from(
    document.querySelectorAll('script[src], link[href]'),
    (el) => el.getAttribute('src') ?? el.getAttribute('href') ?? '',
  )

/**
 * 新 SW 接手咗(controllerchange):'./' 會由佢嘅快取外殼答 = 撳 reload 會攞到嘅版本。
 * 同頁面而家嘅 assets 唔同先提示;首次打開已經攞咗新 index.html 嘅頁面就唔好煩人。
 */
export async function checkForNewBuild(base: string = import.meta.env.BASE_URL): Promise<void> {
  try {
    const res = await fetchWithTimeout(base, { timeoutMs: 8000 })
    if (res.ok && isSameBuild(await res.text(), pageUrls())) return
  } catch {
    // 攞唔到外殼 → 寧可提示,reload 冇壞
  }
  markUpdateReady()
}

/**
 * 而家行緊嘅 entry script 喺 server 仲有冇:404 = 已經部署咗新版,舊 chunk 冇得再攞。
 * HEAD 唔經 SW 快取(sw.js 只處理 GET);網絡失敗當「唔肯定」→ false,唔好亂 reload。
 */
export async function runningBuildGone(): Promise<boolean> {
  const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src
  if (!entry) return false
  try {
    const res = await fetchWithTimeout(entry, { method: 'HEAD', cache: 'no-store', timeoutMs: 8000 })
    return res.status === 404
  } catch {
    return false
  }
}
