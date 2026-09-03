import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetBackNavForTests, useBackLayer } from './useBackLayer'

// history 操作係 microtask 延後做 → 每步之後 flush 一次
const flush = () => act(async () => {})
const depth = () => (history.state as { kkcxNav?: number } | null)?.kkcxNav ?? 0
/** 模擬用戶撳返回:瀏覽器已經退到 depth d,再發 popstate */
const userBack = (d: number) =>
  act(async () => {
    history.replaceState({ kkcxNav: d }, '')
    window.dispatchEvent(new PopStateEvent('popstate', { state: { kkcxNav: d } }))
  })

describe('useBackLayer', () => {
  let pushSpy: ReturnType<typeof vi.spyOn>
  let goSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    _resetBackNavForTests()
    history.replaceState(null, '')
    pushSpy = vi.spyOn(history, 'pushState')
    // jsdom 嘅 history.go 係 async 真導航,會干擾下一個 test → 改做 no-op,只驗證有冇 call
    goSpy = vi.spyOn(history, 'go').mockImplementation(() => {})
  })
  afterEach(async () => {
    cleanup()
    await flush()
    vi.restoreAllMocks()
  })

  it('開一層 push 一個 entry;撳返回 → close', async () => {
    const close = vi.fn()
    const { rerender, unmount } = renderHook(({ on }) => useBackLayer(on, close), {
      initialProps: { on: true },
    })
    await flush()
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(depth()).toBe(1)

    await userBack(0)
    expect(close).toHaveBeenCalledTimes(1)
    rerender({ on: false }) // app 收到 close 後把層閂咗
    await flush()
    expect(goSpy).not.toHaveBeenCalled() // 係用戶退嘅,唔使再 go(-1)
    unmount()
  })

  it('app 自己閂層(唔係撳返回)→ history.go(-1) 對齊', async () => {
    const { rerender } = renderHook(({ on }) => useBackLayer(on, () => {}), { initialProps: { on: true } })
    await flush()
    rerender({ on: false })
    await flush()
    expect(goSpy).toHaveBeenCalledWith(-1)
  })

  it('同一個 commit 閂一層開一層(設定 → 顯示模式)→ 深度冇變,唔郁 history', async () => {
    const { rerender } = renderHook(
      ({ a, b }) => {
        useBackLayer(a, () => {})
        useBackLayer(b, () => {})
      },
      { initialProps: { a: true, b: false } },
    )
    await flush()
    expect(pushSpy).toHaveBeenCalledTimes(1)
    rerender({ a: false, b: true })
    await flush()
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(goSpy).not.toHaveBeenCalled()
  })

  it('locked 層:撳返回唔 close,補返一個 entry + onBlocked', async () => {
    const close = vi.fn()
    const onBlocked = vi.fn()
    renderHook(() => useBackLayer(true, close, { locked: true, onBlocked }))
    await flush()
    expect(depth()).toBe(1)
    await userBack(0)
    expect(close).not.toHaveBeenCalled()
    expect(onBlocked).toHaveBeenCalledTimes(1)
    expect(depth()).toBe(1) // 補返
  })

  it('兩層巢狀:一次過退兩格會由上而下關晒', async () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    renderHook(() => {
      useBackLayer(true, closeA)
      useBackLayer(true, closeB)
    })
    await flush()
    expect(depth()).toBe(2)
    await userBack(0)
    expect(closeB).toHaveBeenCalledTimes(1)
    expect(closeA).toHaveBeenCalledTimes(1)
  })
})
