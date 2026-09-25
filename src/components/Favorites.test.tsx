import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Eta, Route } from '../api/bus'
import { getEta } from '../api/bus'
import { getFavorites, setFavoriteWalk, toggleFavorite, type Favorite } from '../lib/store'
import Favorites from './Favorites'

// 兩個收藏一齊輪詢:測每張卡各自保留舊資料 / 報錯,同埋舊一轉遲返唔會蓋過新結果
vi.mock('../api/bus', () => ({ getEta: vi.fn(), coClass: () => '' }))
vi.mock('../lib/speech', () => ({ speak: vi.fn(), speechSupported: false }))
const favs: Favorite[] = [
  { co: 'kmb', route: '1A', bound: 'O', serviceType: '1', stopId: 'A', stopName: '站甲', dest: '中秀茂坪' },
  { co: 'ctb', route: '969', bound: 'I', serviceType: '1', stopId: 'B', stopName: '站乙', dest: '天水圍' },
]
const keyOf = (f: Favorite) => `${f.co}|${f.route}|${f.bound}|${f.serviceType}|${f.stopId}`
vi.mock('../lib/store', () => ({
  FAVS_CHANGED: 'kkcx:favs-changed',
  favKey: (f: Favorite) => keyOf(f),
  getFavorites: vi.fn(() => favs),
  toggleFavorite: vi.fn(() => favs),
  // 原地改 + 回新 array(同真嘢一樣),等畫面重畫
  setFavoriteWalk: vi.fn((key: string, mins: number | null) => {
    const f = favs.find((x) => keyOf(x) === key)
    if (f) {
      if (mins) f.walkMins = mins
      else delete f.walkMins
    }
    return favs.map((x) => ({ ...x }))
  }),
}))

const T0 = Date.parse('2026-09-25T08:00:00+08:00')
const eta = (mins: number): Eta => ({
  co: 'kmb',
  route: '1A',
  dir: 'O',
  service_type: 1,
  seq: 1,
  dest_tc: '',
  eta_seq: 1,
  eta: new Date(T0 + mins * 60_000).toISOString(),
  rmk_tc: '',
  data_timestamp: '',
})

const mockEta = vi.mocked(getEta)
const flush = () => act(() => vi.advanceTimersByTimeAsync(0))
const card = (stopName: string) => screen.getByText(stopName).closest('.fav-card') as HTMLElement
function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  act(() => void document.dispatchEvent(new Event('visibilitychange')))
}

describe('Favorites', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    setHidden(false)
  })
  afterEach(() => {
    cleanup()
    setHidden(false)
    mockEta.mockReset()
    vi.mocked(setFavoriteWalk).mockClear()
    favs.forEach((f) => delete f.walkMins)
    vi.useRealTimers()
  })

  it('一張卡失敗:嗰張保留舊班次 + 提示,另一張照更新;從未成功嘅先報錯', async () => {
    let calls = 0
    mockEta.mockImplementation(async (r: Route) => {
      calls++
      if (r.co === 'kmb') {
        if (calls <= 2) return [eta(4)]
        throw new TypeError('Failed to fetch')
      }
      throw new TypeError('Load failed')
    })
    render(<Favorites onOpen={() => {}} />)
    await flush()
    expect(within(card('站甲')).getByText('4 分鐘')).toBeTruthy()
    expect(within(card('站乙')).getByText('連唔到伺服器,請稍後再試')).toBeTruthy()

    await act(() => vi.advanceTimersByTimeAsync(5000))
    const a = card('站甲')
    expect(within(a).getByText('4 分鐘')).toBeTruthy()
    expect(within(a).getByText(/網絡唔穩 · 顯示緊 08:00 嘅資料/)).toBeTruthy()
    expect(screen.queryByText(/Failed to fetch|Load failed/)).toBeNull()
  })

  it('上一轉卡住唔會疊新一轉;卡死後開新一轉,舊一轉遲返唔會蓋過新結果', async () => {
    let resolveFirst: (v: Eta[]) => void = () => {}
    mockEta.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r))) // 第一轉 站甲:卡住
    mockEta.mockResolvedValueOnce([eta(20)]) // 第一轉 站乙
    mockEta.mockResolvedValue([eta(12)]) // 之後全部
    render(<Favorites onOpen={() => {}} />)
    await flush()
    await act(() => vi.advanceTimersByTimeAsync(25_000))
    expect(mockEta).toHaveBeenCalledTimes(2) // 未完:5 秒 tick 全部跳過

    await act(() => vi.advanceTimersByTimeAsync(5000)) // 30 秒:當卡死,開新一轉
    expect(mockEta).toHaveBeenCalledTimes(4)
    expect(within(card('站甲')).getByText('08:12')).toBeTruthy()

    resolveFirst([eta(2)]) // 舊一轉而家先返
    await flush()
    expect(within(card('站甲')).getByText('08:12')).toBeTruthy()
    expect(screen.queryByText('08:02')).toBeNull()
    expect(within(card('站乙')).queryByText('08:20')).toBeNull()
  })

  it('一張卡慢(城巴等緊)唔會拖住其他卡:攞到嗰張即刻出', async () => {
    mockEta.mockImplementation((r: Route) =>
      r.co === 'kmb' ? Promise.resolve([eta(4)]) : new Promise<Eta[]>(() => {}),
    )
    render(<Favorites onOpen={() => {}} />)
    await flush()
    expect(within(card('站甲')).getByText('08:04')).toBeTruthy()
    expect(card('站乙').querySelector('[aria-busy="true"]')).toBeTruthy() // 慢嗰張仲係 skeleton
  })

  it('移除收藏掣講明係邊條線邊個站', () => {
    mockEta.mockImplementation(() => new Promise(() => {}))
    render(<Favorites onOpen={() => {}} />)
    expect(screen.getByRole('button', { name: '移除收藏 1A 站甲' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '移除收藏 969 站乙' })).toBeTruthy()
  })

  describe('移除收藏:焦點唔好跌落 body', () => {
    // 真嘢:移除咗就回新 array(畫面少一張卡)
    const removeFav = () =>
      vi.mocked(toggleFavorite).mockImplementationOnce((f) => favs.filter((x) => keyOf(x) !== keyOf(f)))
    afterEach(() => {
      vi.mocked(toggleFavorite).mockReset()
      vi.mocked(getFavorites).mockReset()
      vi.mocked(toggleFavorite).mockImplementation(() => favs)
      vi.mocked(getFavorites).mockImplementation(() => favs)
      document.querySelector('.topbar-home')?.remove()
    })

    it('移除第一張:焦點去下一張卡', () => {
      mockEta.mockImplementation(() => new Promise(() => {}))
      render(<Favorites onOpen={() => {}} />)
      const star = screen.getByRole('button', { name: '移除收藏 1A 站甲' })
      const next = card('站乙').querySelector('.fav-open')
      star.focus()
      removeFav()
      fireEvent.click(star)
      expect(screen.queryByText('站甲')).toBeNull()
      expect(document.activeElement).toBe(next)
    })

    it('移除最後一張:焦點去上一張卡', () => {
      mockEta.mockImplementation(() => new Promise(() => {}))
      render(<Favorites onOpen={() => {}} />)
      const star = screen.getByRole('button', { name: '移除收藏 969 站乙' })
      const prev = card('站甲').querySelector('.fav-open')
      star.focus()
      removeFav()
      fireEvent.click(star)
      expect(document.activeElement).toBe(prev)
    })

    it('冇卡剩:焦點返首頁掣(唔去搜尋框,手機會彈鍵盤)', () => {
      mockEta.mockImplementation(() => new Promise(() => {}))
      const home = document.createElement('button')
      home.className = 'topbar-home'
      document.body.appendChild(home)
      vi.mocked(getFavorites).mockReturnValueOnce([favs[0]])
      vi.mocked(toggleFavorite).mockReturnValueOnce([])
      render(<Favorites onOpen={() => {}} />)
      const star = screen.getByRole('button', { name: '移除收藏 1A 站甲' })
      star.focus()
      fireEvent.click(star)
      expect(screen.queryByRole('heading')).toBeNull()
      expect(document.activeElement).toBe(home)
    })

    it('焦點唔喺 ★(例如 iOS 撳唔會 focus):唔好亂搬焦點', () => {
      mockEta.mockImplementation(() => new Promise(() => {}))
      render(<Favorites onOpen={() => {}} />)
      removeFav()
      fireEvent.click(screen.getByRole('button', { name: '移除收藏 1A 站甲' }))
      expect(document.activeElement).toBe(document.body)
    })
  })

  it('背景分頁返嚟、新資料未到:超過 5 分鐘嘅卡變返 skeleton,唔會顯示走咗嘅車', async () => {
    mockEta.mockResolvedValueOnce([eta(4)]).mockResolvedValueOnce([eta(6)])
    mockEta.mockImplementation(() => new Promise(() => {})) // 返嚟之後網絡好慢
    render(<Favorites onOpen={() => {}} />)
    await flush()
    expect(within(card('站甲')).getByText('08:04')).toBeTruthy()
    setHidden(true)
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000))
    setHidden(false)
    await flush()
    expect(screen.queryByText('08:04')).toBeNull()
    expect(screen.queryByText('08:06')).toBeNull()
    expect(card('站甲').querySelector('[aria-busy="true"]')).toBeTruthy()
  })
  describe('🚶 步行時間', () => {
    const leave = (stopName: string) => card(stopName).querySelector('.eta-leave')?.textContent ?? null
    const rowOf = (el: HTMLElement) => el.closest('.eta-row') as HTMLElement

    it('冇設步行時間:同以前一樣,冇出門提示、冇趕唔切', async () => {
      mockEta.mockResolvedValue([eta(1), eta(8)])
      render(<Favorites onOpen={() => {}} />)
      await flush()
      const a = card('站甲')
      expect(leave('站甲')).toBeNull()
      expect(a.querySelector('.eta-row.missed, .eta-row.catch')).toBeNull()
      expect(within(a).getByText('1 分鐘').className).toContain('soon')
    })

    it('撳 🚶 開快揀(aria-expanded),揀 5 分:存落收藏、收埋、焦點返去掣', async () => {
      mockEta.mockImplementation(() => new Promise(() => {}))
      render(<Favorites onOpen={() => {}} />)
      const chip = screen.getByRole('button', { name: '設定步行時間(1A 站甲)' })
      expect(chip.getAttribute('aria-expanded')).toBe('false')
      expect(chip.textContent).toContain('＋')
      expect(screen.queryByRole('group', { name: '行去站甲要幾耐' })).toBeNull()

      fireEvent.click(chip)
      expect(chip.getAttribute('aria-expanded')).toBe('true')
      const group = screen.getByRole('group', { name: '行去站甲要幾耐' })
      expect(chip.getAttribute('aria-controls')).toBe(group.id)
      expect(
        within(group)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['2 分', '5 分', '8 分', '12 分', '清除'])

      fireEvent.click(within(group).getByRole('button', { name: '5 分' }))
      expect(setFavoriteWalk).toHaveBeenCalledWith('kmb|1A|O|1|A', 5)
      expect(screen.queryByRole('group', { name: '行去站甲要幾耐' })).toBeNull()
      const set = screen.getByRole('button', { name: '步行 5分,改步行時間(1A 站甲)' })
      expect(set).toBe(chip)
      expect(set.textContent).toBe('🚶5分')
      expect(set.getAttribute('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(chip)
      // 另一張卡唔受影響
      expect(screen.getByRole('button', { name: '設定步行時間(969 站乙)' })).toBeTruthy()
    })

    it('設咗嘅值 aria-pressed;清除 → null;Esc 收埋', async () => {
      favs[0].walkMins = 8
      mockEta.mockImplementation(() => new Promise(() => {}))
      render(<Favorites onOpen={() => {}} />)
      const chip = screen.getByRole('button', { name: '步行 8分,改步行時間(1A 站甲)' })
      fireEvent.click(chip)
      const group = screen.getByRole('group', { name: '行去站甲要幾耐' })
      expect(within(group).getByRole('button', { name: '8 分' }).getAttribute('aria-pressed')).toBe('true')
      expect(within(group).getByRole('button', { name: '2 分' }).getAttribute('aria-pressed')).toBe('false')

      fireEvent.keyDown(within(group).getByRole('button', { name: '2 分' }), { key: 'Escape' })
      expect(screen.queryByRole('group')).toBeNull()
      expect(document.activeElement).toBe(chip)
      expect(setFavoriteWalk).not.toHaveBeenCalled()

      fireEvent.click(chip)
      fireEvent.click(screen.getByRole('button', { name: '清除' }))
      expect(setFavoriteWalk).toHaveBeenCalledWith('kmb|1A|O|1|A', null)
      expect(screen.getByRole('button', { name: '設定步行時間(1A 站甲)' })).toBe(chip)
    })

    it('焦點仲喺 🚶 掣都可以 Esc 收埋(唔會漏去返回層);收埋咗嘅 Esc 唔食', async () => {
      mockEta.mockImplementation(() => new Promise(() => {}))
      render(<Favorites onOpen={() => {}} />)
      const chip = screen.getByRole('button', { name: '設定步行時間(1A 站甲)' })
      fireEvent.click(chip)
      expect(screen.getByRole('group', { name: '行去站甲要幾耐' })).toBeTruthy()
      // fireEvent 回傳 false = 有人 preventDefault(useBackLayer 會睇呢個)
      expect(fireEvent.keyDown(chip, { key: 'Escape' })).toBe(false)
      expect(screen.queryByRole('group')).toBeNull()
      expect(chip.getAttribute('aria-expanded')).toBe('false')
      expect(fireEvent.keyDown(chip, { key: 'Escape' })).toBe(true)
    })

    it('移除收藏:順手收埋快揀', async () => {
      mockEta.mockImplementation(() => new Promise(() => {}))
      render(<Favorites onOpen={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: '設定步行時間(1A 站甲)' }))
      expect(screen.getByRole('group', { name: '行去站甲要幾耐' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: '移除收藏 1A 站甲' }))
      expect(screen.queryByRole('group')).toBeNull()
    })

    it('行 5 分鐘:3 分鐘嗰班趕唔切,8 分鐘嗰班「搭呢班」,最遲 08:02 出門', async () => {
      favs[0].walkMins = 5
      mockEta.mockResolvedValue([eta(3), eta(8), eta(15)])
      render(<Favorites onOpen={() => {}} />)
      await flush()
      const a = card('站甲')
      expect(leave('站甲')).toBe('🚶 行 5 分鐘 · 最遲 08:02 出門 → 應該趕到 08:08 班')
      const missed = rowOf(within(a).getByText('3 分鐘'))
      expect(missed.className).toContain('missed')
      expect(within(missed).getByText('趕唔切')).toBeTruthy()
      // 趕唔切就唔好用「就到」橙色催人
      expect(within(a).getByText('3 分鐘').className).not.toContain('soon')
      const pick = rowOf(within(a).getByText('8 分鐘'))
      expect(pick.className).toContain('catch')
      expect(within(pick).getByText('搭呢班')).toBeTruthy()
      expect(rowOf(within(a).getByText('15 分鐘')).className).toBe('eta-row')
      expect(within(a).getAllByText('趕唔切')).toHaveLength(1)
      expect(within(a).getAllByText('搭呢班')).toHaveLength(1)
      // 冇設步行時間嗰張卡照舊
      expect(leave('站乙')).toBeNull()
    })

    it('鬆動得 1 分鐘:而家即刻出門!', async () => {
      favs[0].walkMins = 5
      mockEta.mockResolvedValue([eta(7)])
      render(<Favorites onOpen={() => {}} />)
      await flush()
      expect(leave('站甲')).toBe('🚶 行 5 分鐘 · 而家即刻出門! → 應該趕到 08:07 班')
      expect(card('站甲').querySelector('.eta-leave.now')).toBeTruthy()
    })

    it('頭 3 班都趕唔切:一句講晒,唔好逐行標三次「趕唔切」', async () => {
      favs[0].walkMins = 12
      mockEta.mockResolvedValue([eta(3), eta(8), eta(12)])
      render(<Favorites onOpen={() => {}} />)
      await flush()
      const a = card('站甲')
      expect(leave('站甲')).toBe('🚶 行 12 分鐘 · 頭 3 班都趕唔切,之後班次未有資料')
      expect(a.querySelectorAll('.eta-row.missed')).toHaveLength(3)
      expect(within(a).queryByText('趕唔切')).toBeNull()
      expect(within(a).queryByText('搭呢班')).toBeNull()
    })

    it('備份讀返嚟嘅怪值(字串 / 0)當未設定', async () => {
      ;(favs[0] as { walkMins?: unknown }).walkMins = '5'
      favs[1].walkMins = 0
      mockEta.mockResolvedValue([eta(1)])
      render(<Favorites onOpen={() => {}} />)
      await flush()
      expect(screen.getByRole('button', { name: '設定步行時間(1A 站甲)' })).toBeTruthy()
      expect(screen.getByRole('button', { name: '設定步行時間(969 站乙)' })).toBeTruthy()
      expect(document.querySelector('.eta-leave')).toBeNull()
    })
  })
})
