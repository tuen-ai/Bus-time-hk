import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { retryImport } from './lazyRetry'

const mod = { default: () => null }
/** 等一轉 macrotask,睇下個 promise 有冇 settle */
const settled = async (p: Promise<unknown>) => {
  let done = false
  p.then(
    () => (done = true),
    () => (done = true),
  )
  await new Promise((r) => setTimeout(r, 0))
  return done
}

describe('retryImport(部署後 chunk 唔見咗)', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('載入成功 → 照回 module,唔郁重載', async () => {
    const tryReload = vi.fn(() => true)
    await expect(retryImport(() => Promise.resolve(mod), tryReload)).resolves.toBe(mod)
    expect(tryReload).not.toHaveBeenCalled()
  })

  it('失敗 + 有網 + 容許重載 → 重載,唔拋錯(唔閃 ErrorBoundary)', async () => {
    const tryReload = vi.fn(() => true)
    const p = retryImport(() => Promise.reject(new Error('chunk 404')), tryReload)
    expect(await settled(p)).toBe(false)
    expect(tryReload).toHaveBeenCalledTimes(1)
  })

  it('唔准再重載(啱啱重載過)→ 照拋,交俾 ErrorBoundary(唔會無限 reload)', async () => {
    const tryReload = vi.fn(() => false)
    await expect(retryImport(() => Promise.reject(new Error('chunk 404')), tryReload)).rejects.toThrow(
      'chunk 404',
    )
    expect(tryReload).toHaveBeenCalledTimes(1)
  })

  it('離線 → 唔重載(重載都冇用),照拋', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const tryReload = vi.fn(() => true)
    await expect(retryImport(() => Promise.reject(new Error('offline')), tryReload)).rejects.toThrow(
      'offline',
    )
    expect(tryReload).not.toHaveBeenCalled()
  })

  it('預設用 appUpdate.reloadOnce 嘅記號:10 分鐘內自動重載過 → 唔再重載,照拋', async () => {
    sessionStorage.setItem('kkcx.autoReloadAt', String(Date.now()))
    await expect(retryImport(() => Promise.reject(new Error('chunk 404')))).rejects.toThrow('chunk 404')
  })
})
