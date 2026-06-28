// 喜好預設地點(家 / 公司 / 自訂),存 localStorage。
export interface SavedPlace {
  id: string // 'home' | 'office' | 自訂 uid
  label: string
  icon: string
  lat: number
  lng: number
  address: string
}

const KEY = 'places.saved'

export function getPlaces(): SavedPlace[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as SavedPlace[]
  } catch {
    return []
  }
}

export function getPlace(id: string): SavedPlace | undefined {
  return getPlaces().find((p) => p.id === id)
}

export function savePlace(p: SavedPlace): SavedPlace[] {
  const list = getPlaces().filter((x) => x.id !== p.id)
  list.push(p)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* 容量不足靜默 */
  }
  return list
}

export function removePlace(id: string): SavedPlace[] {
  const list = getPlaces().filter((x) => x.id !== id)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
  return list
}

// 兩個固定預設(若未設定亦顯示,引導用戶去設定)
export const PRESET_DEFS = [
  { id: 'home', label: '家', icon: '🏠' },
  { id: 'office', label: '公司', icon: '🏢' },
]
