import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// appUpdate 有模組狀態 → 每個測試重新 import
const load = async () => {
  vi.resetModules()
  const [{ default: UpdateToast }, appUpdate] = await Promise.all([
    import('./UpdateToast'),
    import('../lib/appUpdate'),
  ])
  return { UpdateToast, ...appUpdate }
}

afterEach(cleanup)

describe('UpdateToast', () => {
  it('未有新版唔顯示,但 live region 一開始就喺度', async () => {
    const { UpdateToast } = await load()
    render(<UpdateToast />)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText(/有新版本/)).toBeNull()
  })

  it('新版就緒 → 顯示;撳就 reload', async () => {
    const { UpdateToast, markUpdateReady } = await load()
    const onReload = vi.fn()
    render(<UpdateToast onReload={onReload} />)
    act(() => markUpdateReady())
    fireEvent.click(screen.getByRole('button', { name: /有新版本 · 撳一下更新/ }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('撳 ✕ 收埋', async () => {
    const { UpdateToast, markUpdateReady } = await load()
    markUpdateReady() // mount 之前已經就緒都要顯示
    render(<UpdateToast onReload={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '遲啲先更新' }))
    expect(screen.queryByText(/有新版本/)).toBeNull()
  })
})
