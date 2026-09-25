import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusables, trapTab } from './focusTrap'

function panel(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = `
    <button id="a">a</button>
    <button id="off" disabled>off</button>
    <input id="b" />
    <input id="file" type="file" hidden />
    <div hidden><button id="inside-hidden">x</button></div>
    <button id="c">c</button>`
  document.body.appendChild(root)
  return root
}

const tab = (shiftKey = false) => ({ key: 'Tab', shiftKey, preventDefault: vi.fn() })

describe('focusTrap', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('focusables 跳過 disabled 同 hidden(包括收埋嘅 file input)', () => {
    const root = panel()
    expect(focusables(root).map((el) => el.id)).toEqual(['a', 'b', 'c'])
  })

  it('Tab 喺最後一個 → 返第一個', () => {
    const root = panel()
    root.querySelector<HTMLElement>('#c')!.focus()
    const e = tab()
    trapTab(e, root)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(document.activeElement?.id).toBe('a')
  })

  it('Shift+Tab 喺第一個 → 去最後一個', () => {
    const root = panel()
    root.querySelector<HTMLElement>('#a')!.focus()
    const e = tab(true)
    trapTab(e, root)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(document.activeElement?.id).toBe('c')
  })

  it('中間嘅 Tab 唔理,等瀏覽器自己行', () => {
    const root = panel()
    root.querySelector<HTMLElement>('#b')!.focus()
    const e = tab()
    trapTab(e, root)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(document.activeElement?.id).toBe('b')
  })

  it('焦點跌咗出面板 → 拉返入嚟', () => {
    const root = panel()
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    trapTab(tab(), root)
    expect(document.activeElement?.id).toBe('a')
  })

  it('唔係 Tab 鍵 / 冇 root → 乜都唔做', () => {
    const root = panel()
    root.querySelector<HTMLElement>('#c')!.focus()
    const e = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() }
    trapTab(e, root)
    trapTab(tab(), null)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(document.activeElement?.id).toBe('c')
  })
})
