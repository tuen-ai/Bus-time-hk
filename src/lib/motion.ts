// 用家喺系統開咗「減少動態效果」:捲動 / 地圖飛過去都改做即刻跳,唔好郁嚟郁去
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** scrollIntoView / scrollTo 用:減少動態就即刻跳,否則順滑捲 */
export const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? 'auto' : 'smooth')
