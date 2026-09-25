import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// 撳 ✕ 收埋:✕ 會消失 → 焦點要送返去,唔好跌落 body
const load = async () => {
  vi.resetModules()
  const [{ default: UpdateToast }, appUpdate] = await Promise.all([
    import('./UpdateToast'),
    import('../lib/appUpdate'),
  ])
  return { UpdateToast, ...appUpdate }
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('UpdateToast 焦點', () => {
  it('Tab 入嚟再撳 ✕:焦點返去原本嗰粒掣', async () => {
    const { UpdateToast, markUpdateReady } = await load()
    render(
      <>
        <button type="button">之前</button>
        <UpdateToast onReload={vi.fn()} />
      </>,
    )
    act(() => markUpdateReady())
    const before = screen.getByRole('button', { name: '之前' })
    const x = screen.getByRole('button', { name: '遲啲先更新' })
    before.focus()
    x.focus() // relatedTarget = 之前
    fireEvent.click(x)
    expect(screen.queryByText(/有新版本/)).toBeNull()
    expect(document.activeElement).toBe(before)
  })

  it('原本嗰粒已經唔喺度:返首頁掣', async () => {
    const { UpdateToast, markUpdateReady } = await load()
    const home = document.createElement('button')
    home.className = 'topbar-home'
    document.body.appendChild(home)
    const Page = ({ show }: { show: boolean }) => (
      <>
        {show && <button type="button">之前</button>}
        <UpdateToast onReload={vi.fn()} />
      </>
    )
    const { rerender } = render(<Page show />)
    act(() => markUpdateReady())
    screen.getByRole('button', { name: '之前' }).focus()
    const x = screen.getByRole('button', { name: '遲啲先更新' })
    x.focus()
    rerender(<Page show={false} />) // 「之前」被移走
    expect(document.activeElement).toBe(x)
    fireEvent.click(screen.getByRole('button', { name: '遲啲先更新' }))
    expect(document.activeElement).toBe(home)
  })

  describe('原本喺輸入框', () => {
    const setup = async () => {
      const { UpdateToast, markUpdateReady } = await load()
      const home = document.createElement('button')
      home.className = 'topbar-home'
      document.body.appendChild(home)
      render(
        <>
          <input aria-label="搜尋" />
          <UpdateToast onReload={vi.fn()} />
        </>,
      )
      act(() => markUpdateReady())
      const input = screen.getByRole('textbox', { name: '搜尋' })
      const x = screen.getByRole('button', { name: '遲啲先更新' })
      input.focus()
      x.focus() // Chrome / Android:撳掣會 focus 埋粒掣,relatedTarget = 輸入框
      return { home, input, x }
    }

    it('手指撳 ✕:唔好送返輸入框(手機會彈返鍵盤),返首頁掣', async () => {
      const { home, x } = await setup()
      fireEvent.click(x, { detail: 1 })
      expect(document.activeElement).toBe(home)
    })

    it('鍵盤 Enter / Space(click detail 0):照返輸入框', async () => {
      const { input, x } = await setup()
      fireEvent.click(x, { detail: 0 })
      expect(document.activeElement).toBe(input)
    })
  })

  it('原本嗰粒 focus 唔到(例如 disabled 咗):返首頁掣', async () => {
    const { UpdateToast, markUpdateReady } = await load()
    const home = document.createElement('button')
    home.className = 'topbar-home'
    document.body.appendChild(home)
    render(
      <>
        <button type="button">之前</button>
        <UpdateToast onReload={vi.fn()} />
      </>,
    )
    act(() => markUpdateReady())
    const before = screen.getByRole('button', { name: '之前' }) as HTMLButtonElement
    const x = screen.getByRole('button', { name: '遲啲先更新' })
    before.focus()
    x.focus()
    before.disabled = true
    fireEvent.click(x)
    expect(document.activeElement).toBe(home)
  })

  it('焦點唔喺 ✕(例如 iOS 撳唔會 focus):唔好亂搬焦點', async () => {
    const { UpdateToast, markUpdateReady } = await load()
    const home = document.createElement('button')
    home.className = 'topbar-home'
    document.body.appendChild(home)
    render(<UpdateToast onReload={vi.fn()} />)
    act(() => markUpdateReady())
    fireEvent.click(screen.getByRole('button', { name: '遲啲先更新' }))
    expect(document.activeElement).toBe(document.body)
  })
})
