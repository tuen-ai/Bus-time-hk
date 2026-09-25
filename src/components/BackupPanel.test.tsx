import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BackupPanel from './BackupPanel'

describe('BackupPanel(設定面板)', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('係 modal dialog,讀屏名係「設定」,開版焦點喺 ✕', () => {
    const onClose = vi.fn()
    render(<BackupPanel onClose={onClose} onEnterDisplay={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: '設定' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const close = screen.getByRole('button', { name: '關閉' })
    expect(document.activeElement).toBe(close)
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('金句下拉同自訂輸入格都有名(唔靠 placeholder)', () => {
    render(<BackupPanel onClose={() => {}} onEnterDisplay={() => {}} />)
    const fixed = screen.getByRole('button', { name: '固定一句' })
    fireEvent.click(fixed)
    expect(fixed.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('combobox', { name: '揀一句固定金句' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '自己寫' }))
    expect(screen.getByRole('textbox', { name: '自訂金句' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '金句出處或署名' })).toBeTruthy()
  })

  it('匯入壞檔:唔會出 JSON.parse 英文原文', async () => {
    const { container } = render(<BackupPanel onClose={() => {}} />)
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    const bad = new File(['{not json'], 'x.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [bad] } })
    const status = await waitFor(() => {
      const s = screen.getByRole('status')
      expect(s.textContent).not.toBe('')
      return s
    })
    expect(status.textContent).toContain('讀唔到呢個檔')
    expect(status.textContent).not.toMatch(/[A-Za-z]{4,}/)
  })
})
