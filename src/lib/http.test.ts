import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpError, fetchJson, fetchWithTimeout, friendlyError } from './http'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('fetchJson', () => {
  it('returns parsed JSON on 2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ a: 1 }), { status: 200 }))
    await expect(fetchJson<{ a: number }>('https://x/y')).resolves.toEqual({ a: 1 })
  })

  it('throws HttpError on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 503 }))
    await expect(fetchJson('https://x/y')).rejects.toBeInstanceOf(HttpError)
  })
})

describe('fetchWithTimeout', () => {
  it('always passes an abort signal to fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    await fetchWithTimeout('https://x/y', { timeoutMs: 1000 })
    const init = spy.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('aborts when the caller signal aborts', async () => {
    const ctl = new AbortController()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_u, init) =>
        new Promise((_res, rej) => {
          ;(init as RequestInit).signal!.addEventListener('abort', () =>
            rej(new DOMException('x', 'AbortError')),
          )
        }),
    )
    const p = fetchWithTimeout('https://x/y', { signal: ctl.signal, timeoutMs: 60_000 })
    ctl.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('timeout fallback', () => {
  it('still times out when AbortSignal.timeout is missing (iOS 15)', async () => {
    vi.useFakeTimers()
    const orig = AbortSignal.timeout
    // @ts-expect-error 模擬舊 Safari
    AbortSignal.timeout = undefined
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (_u, init) =>
          new Promise((_res, rej) => {
            const s = (init as RequestInit).signal!
            s.addEventListener('abort', () => rej(s.reason))
          }),
      )
      const p = fetchWithTimeout('https://x/y', { timeoutMs: 500 })
      const check = expect(p).rejects.toMatchObject({ name: 'TimeoutError' })
      await vi.advanceTimersByTimeAsync(600)
      await check
    } finally {
      AbortSignal.timeout = orig
    }
  })
})

describe('friendlyError', () => {
  it('maps errors to Cantonese messages', () => {
    expect(friendlyError(new HttpError(500, 'u'))).toContain('500')
    expect(friendlyError(new DOMException('t', 'TimeoutError'))).toContain('網絡太慢')
    expect(friendlyError(new TypeError('Failed to fetch'))).not.toContain('Failed')
    expect(friendlyError(new Error('綠van 車站資料載入唔到'))).toBe('綠van 車站資料載入唔到')
  })
})
