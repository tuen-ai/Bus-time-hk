import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BearBody, BearFace, PandaBody, PandaFace } from './Mascots'
import { MILESTONES } from '../lib/stamps'

afterEach(cleanup)

describe('公仔升級', () => {
  it('平時開眼 + 有眨眼用嘅閂眼層;耳仔可以郁', () => {
    const { container } = render(<PandaFace />)
    expect(container.querySelector('svg')?.classList.contains('m-live')).toBe(true)
    expect(container.querySelector('.m-open')).toBeTruthy()
    expect(container.querySelector('.m-shut')).toBeTruthy()
    expect(container.querySelectorAll('.m-ear')).toHaveLength(2)
    expect(container.querySelector('.m-zzz')).toBeNull()
  })

  it('眼瞓:冇開眼層、閂眼唔再眨、有 Zzz', () => {
    const { container } = render(
      <>
        <PandaFace sleepy />
        <BearFace sleepy />
      </>,
    )
    expect(container.querySelector('.m-open')).toBeNull()
    expect(container.querySelector('.m-shut')).toBeNull()
    expect(container.querySelector('.m-blink')).toBeNull()
    expect(container.querySelectorAll('.m-zzz')).toHaveLength(2)
  })

  it('全身版會揮手;可可卡只喺解鎖咗先拎住', () => {
    const { container, rerender } = render(<BearBody />)
    expect(container.querySelector('.m-wave.l')).toBeTruthy()
    const shapes = () => container.querySelectorAll('rect').length
    const without = shapes()
    rerender(<BearBody card />)
    expect(shapes()).toBe(without + 1)
    render(<PandaBody cap />)
    expect(document.querySelectorAll('.m-wave.r')).toHaveLength(1)
  })

  it('落雨撐遮就唔戴車長帽(唔好兩樣疊埋)', () => {
    const count = (el: Element) => el.querySelectorAll('rect').length
    const withCap = render(<PandaFace cap />).container
    const umbrella = render(<PandaFace cap umbrella />).container
    expect(count(withCap)).toBeGreaterThan(count(umbrella))
  })

  it('新獎勵(車長帽 5 日、可可卡 10 日)按日數排好', () => {
    const ats = MILESTONES.map((m) => m.at)
    expect([...ats].sort((a, b) => a - b)).toEqual(ats)
    expect(MILESTONES.find((m) => m.id === 'cap')?.at).toBe(5)
    expect(MILESTONES.find((m) => m.id === 'card')?.at).toBe(10)
  })
})
