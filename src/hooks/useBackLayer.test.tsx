import { act, cleanup, render, renderHook } from '@testing-library/react'
import { lazy, Suspense, type ComponentType } from 'react'
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
/** 模擬撳 Esc;回傳個 event 睇下有冇被 preventDefault */
const pressKey = (init: KeyboardEventInit & { keyCode?: number } = {}) => {
  const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init })
  if (init.keyCode != null) Object.defineProperty(ev, 'keyCode', { value: init.keyCode })
  window.dispatchEvent(ev)
  return ev
}

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

  it('lazy 顯示模式:Suspense fallback 先頂住鎖定層 → 閂設定 + 載 chunk 全程唔郁 history', async () => {
    const Real = () => {
      useBackLayer(true, () => {}, { locked: true })
      return null
    }
    const Hold = () => {
      useBackLayer(true, () => {}, { locked: true })
      return null
    }
    let resolve!: (m: { default: ComponentType }) => void
    const Lazy = lazy(() => new Promise<{ default: ComponentType }>((r) => (resolve = r)))
    const Host = ({ settings, kiosk }: { settings: boolean; kiosk: boolean }) => {
      useBackLayer(settings, () => {})
      return kiosk ? (
        <Suspense fallback={<Hold />}>
          <Lazy />
        </Suspense>
      ) : null
    }
    const { rerender } = render(<Host settings kiosk={false} />)
    await flush()
    expect(pushSpy).toHaveBeenCalledTimes(1)
    // 設定入面撳「門口顯示模式」:同一個 commit 閂設定、fallback 開鎖定層
    rerender(<Host settings={false} kiosk />)
    await flush()
    // chunk 到咗:fallback 層換 DisplayMode 層,亦係同一個 commit
    await act(async () => resolve({ default: Real }))
    await flush()
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(goSpy).not.toHaveBeenCalled()
    expect(pressKey().defaultPrevented).toBe(false) // 鎖定層:Esc 唔關
  })

  describe('Esc 鍵', () => {
    it('關最上面一層(唔郁下面),之後 go(-1) 對齊 history', async () => {
      const closeA = vi.fn()
      const closeB = vi.fn()
      const { rerender } = renderHook(
        ({ b }) => {
          useBackLayer(true, closeA)
          useBackLayer(b, closeB)
        },
        { initialProps: { b: true } },
      )
      await flush()
      const ev = pressKey()
      expect(closeB).toHaveBeenCalledTimes(1)
      expect(closeA).not.toHaveBeenCalled()
      expect(ev.defaultPrevented).toBe(true)
      rerender({ b: false }) // app 收到 close 後閂咗
      await flush()
      expect(goSpy).toHaveBeenCalledWith(-1)
    })

    it('locked 層(顯示模式)同 escape:false 層(分頁)唔會被 Esc 關', async () => {
      const closeTab = vi.fn()
      const closeLocked = vi.fn()
      const { rerender } = renderHook(
        ({ locked }) => {
          useBackLayer(true, closeTab, { escape: false })
          useBackLayer(locked, closeLocked, { locked: true })
        },
        { initialProps: { locked: true } },
      )
      await flush()
      expect(pressKey().defaultPrevented).toBe(false)
      expect(closeLocked).not.toHaveBeenCalled()
      rerender({ locked: false })
      await flush()
      pressKey()
      expect(closeTab).not.toHaveBeenCalled()
    })

    it('其他鍵 / 組件已處理 / 輸入法選字中 → 唔關', async () => {
      const close = vi.fn()
      renderHook(() => useBackLayer(true, close))
      await flush()
      pressKey({ key: 'Enter' })
      pressKey({ isComposing: true })
      pressKey({ keyCode: 229 }) // Safari 取消選字
      const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
      handled.preventDefault()
      window.dispatchEvent(handled)
      expect(close).not.toHaveBeenCalled()
      pressKey()
      expect(close).toHaveBeenCalledTimes(1)
    })

    it('撳住唔放(自動連發)唔會一路關落去:顯示模式撳住 Esc 退出後唔好連底下嗰層都關埋', async () => {
      const closeRoute = vi.fn()
      const closeKiosk = vi.fn()
      const { rerender } = renderHook(
        ({ kiosk }) => {
          useBackLayer(true, closeRoute)
          useBackLayer(kiosk, closeKiosk, { locked: true })
        },
        { initialProps: { kiosk: true } },
      )
      await flush()
      pressKey() // 開始撳住:鎖定層唔理
      rerender({ kiosk: false }) // 3 秒到,DisplayMode 自己退出
      await flush()
      const ev = pressKey({ repeat: true }) // 手指仲未放
      expect(ev.defaultPrevented).toBe(false)
      expect(closeRoute).not.toHaveBeenCalled()
      pressKey() // 放手再撳一下先關
      expect(closeRoute).toHaveBeenCalledTimes(1)
      expect(closeKiosk).not.toHaveBeenCalled()
    })

    it('冇層開住 → Esc 乜都唔做', () => {
      expect(pressKey().defaultPrevented).toBe(false)
    })
  })
})
