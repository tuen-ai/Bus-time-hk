// 路線標籤:夜間 / 特別班次
export interface RouteBadge {
  label: string
  kind: 'night' | 'special'
}

export function routeBadges(route: string, serviceType: string): RouteBadge[] {
  const badges: RouteBadge[] = []
  if (/^N/i.test(route)) badges.push({ label: '夜', kind: 'night' })
  // 輕鐵 '*'(例如 751*)係特別班次:唔係成日有車,暫無班次都正常
  const special = (serviceType && serviceType !== '1') || route.endsWith('*')
  if (special) badges.push({ label: '特別班', kind: 'special' })
  return badges
}
