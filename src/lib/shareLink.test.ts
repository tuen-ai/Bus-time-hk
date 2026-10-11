import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHash, routeHash, shareOrCopy, shareTitle, shareUrl, type RouteLink } from './shareLink'

const loc = { origin: 'https://tuen-ai.github.io', pathname: '/Bus-time-hk/' }

describe('分享連結 hash', () => {
  const cases: RouteLink[] = [
    { co: 'kmb', route: '1A', bound: 'O', serviceType: '1' },
    { co: 'kmb', route: '1A', bound: 'O', serviceType: '1', stopId: '18492910339410B1' },
    { co: 'gmb', route: '11', bound: 'I', serviceType: '1', stopId: '20015557', uid: '2007596' },
    { co: 'nlb', route: 'B2', bound: 'O', serviceType: '1', uid: 'x/y&z' },
    { co: 'ctb', route: 'N8 特', bound: 'I', serviceType: '2', stopId: '00/1' },
  ]
  it.each(cases)('serialize → parse 一模一樣:%o', (q) => {
    expect(parseHash(routeHash(q))).toEqual({ kind: 'route', link: q })
  })

  it('網址保留 GitHub Pages 子目錄', () => {
    expect(shareUrl({ co: 'kmb', route: '1A', bound: 'O', serviceType: '1', stopId: 'S1' }, loc)).toBe(
      'https://tuen-ai.github.io/Bus-time-hk/#r=kmb/1A/O/1/S1',
    )
  })

  it('唔關事嘅 hash 回 null', () => {
    expect(parseHash('')).toBeNull()
    expect(parseHash('#display')).toBeNull()
  })

  it.each([
    '#r=',
    '#r=kmb/1A',
    '#r=xyz/1A/O/1',
    '#r=kmb/1A/X/1',
    '#r=kmb//O/1',
    '#r=kmb/1A/O/1/a/b',
    '#r=kmb/%E0/O/1',
    '#tab=foo',
  ])('壞連結 %s → invalid', (h) => {
    expect(parseHash(h)).toEqual({ kind: 'invalid' })
  })

  it('分頁捷徑', () => {
    expect(parseHash('#tab=nearby')).toEqual({ kind: 'tab', tab: 'nearby' })
    expect(parseHash('#tab=favs')).toEqual({ kind: 'tab', tab: 'favs' })
  })

  it('分享標題', () => {
    expect(shareTitle({ co: 'kmb', route: '1A', dest: '中秀茂坪' }, '尖沙咀站')).toBe(
      '可可出行 · 九巴 1A 往中秀茂坪 · 尖沙咀站',
    )
    expect(shareTitle({ co: 'kmb', route: '1A', dest: '中秀茂坪' })).toBe('可可出行 · 九巴 1A 往中秀茂坪')
  })
})

describe('shareOrCopy', () => {
  const nav = navigator as Navigator & { share?: unknown }
  afterEach(() => {
    Reflect.deleteProperty(nav, 'share')
    Reflect.deleteProperty(navigator, 'clipboard')
  })
  const mockClipboard = () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    return writeText
  }

  it('冇 Web Share:抄去剪貼簿', async () => {
    const writeText = mockClipboard()
    expect(await shareOrCopy('t', 'https://x/#r=kmb/1A/O/1')).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://x/#r=kmb/1A/O/1')
  })

  it('有 Web Share:用系統分享,唔抄', async () => {
    const writeText = mockClipboard()
    const share = vi.fn(() => Promise.resolve())
    nav.share = share
    expect(await shareOrCopy('標題', 'https://x/')).toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: '標題', text: '標題', url: 'https://x/' })
    expect(writeText).not.toHaveBeenCalled()
  })

  it('用家閂咗分享面板:唔抄', async () => {
    const writeText = mockClipboard()
    nav.share = vi.fn(() => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })))
    expect(await shareOrCopy('t', 'u')).toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('分享出錯(例如唔准):退返抄連結', async () => {
    const writeText = mockClipboard()
    nav.share = vi.fn(() => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })))
    expect(await shareOrCopy('t', 'u')).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('u')
  })

  it('剪貼簿都冇:failed', async () => {
    expect(await shareOrCopy('t', 'u')).toBe('failed')
  })
})
