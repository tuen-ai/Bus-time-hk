// 路線標籤:夜間 / 特別班次
export interface RouteBadge {
  label: string
  kind: 'night' | 'special'
}

export function routeBadges(route: string, serviceType: string): RouteBadge[] {
  const badges: RouteBadge[] = []
  if (/^N/i.test(route)) badges.push({ label: '夜', kind: 'night' })
  if (serviceType && serviceType !== '1') badges.push({ label: '特別班', kind: 'special' })
  return badges
}
