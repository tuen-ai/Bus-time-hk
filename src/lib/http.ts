// 共用 fetch:每個請求都有 timeout,唔會因為一個 hang 住嘅連線拖死成個畫面
// (例如收藏一齊攞 ETA 用 Promise.all,一個城巴請求卡住,全部卡住)。

export const DEFAULT_TIMEOUT_MS = 12_000

export class HttpError extends Error {
  readonly status: number
  readonly url: string
  constructor(status: number, url: string) {
    super(`HTTP ${status}`)
    this.name = 'HttpError'
    this.status = status
    this.url = url
  }
}

/** timeout signal:iOS 15 / Safari < 16 冇 AbortSignal.timeout,要自己砌 */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const ctl = new AbortController()
  setTimeout(() => ctl.abort(new DOMException('signal timed out', 'TimeoutError')), ms)
  return ctl.signal
}

/** 合併多個 AbortSignal(舊瀏覽器冇 AbortSignal.any 就手動轉發) */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any
  if (any) return any(signals)
  const ctl = new AbortController()
  for (const s of signals) {
    if (s.aborted) {
      ctl.abort(s.reason)
      break
    }
    s.addEventListener('abort', () => ctl.abort(s.reason), { once: true })
  }
  return ctl.signal
}

export interface TimeoutInit extends RequestInit {
  /** 預設 12 秒;大檔(例如全部路線清單)可以畀長啲 */
  timeoutMs?: number
}

/** fetch + timeout(可同 caller 自己嘅 signal 並存) */
export function fetchWithTimeout(url: string, init: TimeoutInit = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init
  const timeout = timeoutSignal(timeoutMs)
  return fetch(url, { ...rest, signal: signal ? anySignal([signal, timeout]) : timeout })
}

/** fetch JSON:非 2xx 拋 HttpError;timeout / 斷線拋原本嘅錯 */
export async function fetchJson<T>(url: string, init?: TimeoutInit): Promise<T> {
  const res = await fetchWithTimeout(url, init)
  if (!res.ok) throw new HttpError(res.status, url)
  return (await res.json()) as T
}

/** 錯誤轉做俾用家睇嘅廣東話(唔好直接顯示 "Failed to fetch")。
 *  自己拋嘅中文訊息(例如「綠van 車站資料載入唔到」)照出。 */
export function friendlyError(e: unknown): string {
  if (e instanceof HttpError) return `伺服器暫時冇回應(${e.status})`
  const name = (e as { name?: string } | null)?.name
  if (name === 'TimeoutError' || name === 'AbortError') return '網絡太慢,等咗好耐都未有回應'
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return '冇網絡連線'
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  if (/[㐀-鿿]/.test(msg)) return msg
  return '連唔到伺服器,請稍後再試'
}
