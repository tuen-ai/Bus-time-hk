// 共用 async 快取:TTL 內直接回舊值;in-flight 期間所有 caller 共用同一個 promise
// (例如 WeatherBanner + MascotWelcome 同時 mount,只會發一次請求)。
export function memoAsync<T>(fn: () => Promise<T>, ttlMs: number): () => Promise<T> {
  let value: { ts: number; data: T } | null = null
  let inflight: Promise<T> | null = null
  return () => {
    if (value && Date.now() - value.ts < ttlMs) return Promise.resolve(value.data)
    if (inflight) return inflight
    inflight = fn()
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
        inflight = null
      })
    return inflight
  }
}
