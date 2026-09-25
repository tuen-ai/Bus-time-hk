import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// reloadOnce 會真係 reload(jsdom 做唔到)→ mock 走,淨係睇 ErrorBoundary 點用
const reloadOnce = vi.fn(() => true)
vi.mock('../lib/appUpdate', async (orig) => ({
  ...(await orig<typeof import('../lib/appUpdate')>()),
  reloadOnce: () => reloadOnce(),
  isReloading: () => false,
}))

const { default: ErrorBoundary } = await import('./ErrorBoundary')

function Boom({ msg }: { msg: string }): never {
  throw new Error(msg)
}

const setOnline = (v: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(v)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(cleanup)

describe('ErrorBoundary', () => {
  it('一般錯誤:廣東話提示,英文原文收埋喺「技術資料」,唔會自動 reload', () => {
    setOnline(true)
    render(
      <ErrorBoundary>
        <Boom msg="Cannot read properties of undefined" />
      </ErrorBoundary>,
    )
    expect(screen.getByText('哎呀,出咗啲事…')).toBeTruthy()
    expect(screen.getByText('頁面遇到錯誤,重新載入通常就冇事。')).toBeTruthy()
    const raw = screen.getByText(/Cannot read properties/)
    expect(raw.closest('details')).not.toBeNull()
    expect(reloadOnce).not.toHaveBeenCalled()
  })

  it('有網 + chunk 載入失敗 → 自動 reload 一次,顯示「更新緊新版本」', () => {
    setOnline(true)
    render(
      <ErrorBoundary>
        <Boom msg="Failed to fetch dynamically imported module: https://x/assets/MtrView-abc.js" />
      </ErrorBoundary>,
    )
    expect(reloadOnce).toHaveBeenCalledTimes(1)
    expect(screen.getByText('更新緊新版本…')).toBeTruthy()
  })

  it('reload 額度用完 → 唔 loop,叫用戶自己撳', () => {
    setOnline(true)
    reloadOnce.mockReturnValueOnce(false)
    render(
      <ErrorBoundary>
        <Boom msg="Importing a module script failed." />
      </ErrorBoundary>,
    )
    expect(screen.getByText('哎呀,出咗啲事…')).toBeTruthy()
    expect(screen.getByText('有新版本或者網絡唔穩定,撳重新載入就得。')).toBeTruthy()
  })

  it('離線 chunk 失敗:唔 reload(冇用),話用戶有網再撳', () => {
    setOnline(false)
    render(
      <ErrorBoundary>
        <Boom msg="error loading dynamically imported module" />
      </ErrorBoundary>,
    )
    expect(reloadOnce).not.toHaveBeenCalled()
    expect(screen.getByText('冇網絡連線,有網再撳重新載入就得。')).toBeTruthy()
  })
})
