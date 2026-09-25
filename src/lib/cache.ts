// 共用 async 快取:TTL 內直接回舊值;in-flight 期間所有 caller 共用同一個 promise
// (例如 WeatherBanner + MascotWelcome 同時 mount,只會發一次請求)。
// 注意:fn 失敗要「拋錯」先會回舊值 —— fn 自己 catch 晒當成功,空白結果就會蓋過上次嘅好資料。

/** in-flight 最多等幾耐:過咗當失敗,唔好一個 hang 住嘅請求卡死之後所有 caller */
export const MEMO_MAX_WAIT_MS = 30_000

export interface MemoOptions {
  /** 0 / Infinity = 唔設死線(setTimeout 畀 Infinity 會即刻觸發,所以要特登跳過) */
  maxWaitMs?: number
}

export function memoAsync<T>(
  fn: () => Promise<T>,
  ttlMs: number,
  { maxWaitMs = MEMO_MAX_WAIT_MS }: MemoOptions = {},
): () => Promise<T> {
  let value: { ts: number; data: T } | null = null
  let inflight: Promise<T> | null = null
  return () => {
    if (value && Date.now() - value.ts < ttlMs) return Promise.resolve(value.data)
    if (inflight) return inflight
    let job: Promise<T>
    try {
      job = fn()
    } catch (e) {
      job = Promise.reject(e) // 同步拋錯都當失敗處理(有舊值回舊值),唔好漏咗個死線 timer
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    if (maxWaitMs > 0 && Number.isFinite(maxWaitMs)) {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DOMException('等太耐', 'TimeoutError')), maxWaitMs)
      })
      job = Promise.race([job, deadline])
    }
    inflight = job
      .then((data) => {
        value = { ts: Date.now(), data }
        return data
      })
      .catch((e) => {
        // 失敗但有舊值 → 回舊值(graceful);無就照拋
        if (value) return value.data
        throw e
      })
      .finally(() => {
        clearTimeout(timer)
        inflight = null
      })
    return inflight
  }
}
