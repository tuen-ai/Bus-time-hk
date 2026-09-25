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

  describe('顯示排序 ↑↓:撳完焦點留喺同一個收藏', () => {
    const fav = (route: string) => ({
      co: 'kmb',
      route,
      bound: 'O',
      serviceType: '1',
      stopId: `S${route}`,
      stopName: `站${route}`,
      dest: '中環',
    })
    const order = () => Array.from(document.querySelectorAll('.fav-order-badge')).map((b) => b.textContent)
    beforeEach(() => {
      localStorage.setItem('kmb.favorites', JSON.stringify([fav('1'), fav('2'), fav('3')]))
    })

    it('連撳兩下 ↓:同一行一路落,焦點跟住佢(唔會第二下撳落 body)', () => {
      render(<BackupPanel onClose={() => {}} onEnterDisplay={() => {}} />)
      const down1 = screen.getByRole('button', { name: '1 往下移' })
      down1.focus()
      fireEvent.click(down1)
      expect(order()).toEqual(['2', '1', '3'])
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '1 往下移' }))
      fireEvent.click(document.activeElement as HTMLElement)
      expect(order()).toEqual(['2', '3', '1'])
    })

    it('去到尾 ↓ 變 disabled:焦點轉去同一行嘅 ↑', () => {
      render(<BackupPanel onClose={() => {}} onEnterDisplay={() => {}} />)
      const down2 = screen.getByRole('button', { name: '2 往下移' })
      down2.focus()
      fireEvent.click(down2)
      expect(order()).toEqual(['1', '3', '2'])
      expect((screen.getByRole('button', { name: '2 往下移' }) as HTMLButtonElement).disabled).toBe(true)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '2 往上移' }))
    })

    it('去到頭 ↑ 變 disabled:焦點轉去同一行嘅 ↓', () => {
      render(<BackupPanel onClose={() => {}} onEnterDisplay={() => {}} />)
      const up2 = screen.getByRole('button', { name: '2 往上移' })
      up2.focus()
      fireEvent.click(up2)
      expect(order()).toEqual(['2', '1', '3'])
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '2 往下移' }))
    })
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
