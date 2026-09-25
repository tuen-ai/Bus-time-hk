import { afterEach, describe, expect, it, vi } from 'vitest'
import { getReminder, reminderDue, setReminder, subscribeReminder, type LeaveReminder } from './reminder'

const KEY = 'kkcx.leaveReminder'
const rem = (at: number, extra: Partial<LeaveReminder> = {}): LeaveReminder => ({
  at,
  destLabel: '公司',
  journeyMins: 30,
  arriveBy: '09:00',
  ...extra,
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('reminderDue', () => {
  it('未夠鐘唔響,夠鐘響', () => {
    expect(reminderDue(rem(1000), 999)).toBe(false)
    expect(reminderDue(rem(1000), 1000)).toBe(true)
  })
  it('響過(fired)唔再響;冇提醒唔響', () => {
    expect(reminderDue(rem(1000, { fired: true }), 5000)).toBe(false)
    expect(reminderDue(null, 5000)).toBe(false)
  })
  it('新設嘅提醒(冇 fired)一定會響,唔理上一個響過未', () => {
    expect(reminderDue(rem(2000), 2000)).toBe(true)
  })
})

describe('setReminder / getReminder', () => {
  it('fired 會持久化(reload 讀返出嚟唔會再響)', () => {
    const at = Date.now() - 60_000
    setReminder(rem(at, { fired: true }))
    const r = getReminder()
    expect(r?.fired).toBe(true)
    expect(reminderDue(r, Date.now())).toBe(false)
  })

  it('過咗成個鐘自動棄掉;壞資料當冇', () => {
    localStorage.setItem(KEY, JSON.stringify(rem(Date.now() - 2 * 60 * 60 * 1000)))
    expect(getReminder()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
    localStorage.setItem(KEY, '{"destLabel":"x"}')
    expect(getReminder()).toBeNull()
    localStorage.setItem(KEY, 'null')
    expect(getReminder()).toBeNull()
  })

  it('storage 寫唔到(爆 quota / 封鎖)都唔拋錯,照通知 listeners', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const fn = vi.fn()
    const off = subscribeReminder(fn)
    const r = rem(Date.now(), { fired: true })
    expect(() => setReminder(r)).not.toThrow()
    expect(fn).toHaveBeenCalledWith(r)
    off()
  })
})
