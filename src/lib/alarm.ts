// 落車鬧鐘:watchPosition 持續計同目的站距離,接近就震+響+通知。
// ⚠️ 要 app 開住 + 螢幕着(手機背景會停 GPS);純前端限制。
import { distanceMeters } from './geo'
import { alertAll } from './chime'

export const ALARM_FIRE_M = 400 // 幾近先響(米)

export interface AlightAlarm {
  stopId: string
  stopName: string
  lat: number
  lng: number
  routeLabel: string // 例如「九巴 269D」
  dist: number | null // 而家距離(米);未有 fix = null
  fired: boolean
  geoError?: string
}

type Listener = (a: AlightAlarm | null) => void
const listeners = new Set<Listener>()
let current: AlightAlarm | null = null
let watchId: number | null = null

export const getAlarm = (): AlightAlarm | null => current

export function subscribeAlarm(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit(): void {
  listeners.forEach((fn) => fn(current))
}

export function startAlarm(a: Omit<AlightAlarm, 'dist' | 'fired'>): void {
  stopAlarm()
  current = { ...a, dist: null, fired: false }
  emit()
  if (!('geolocation' in navigator)) {
    current = { ...current, geoError: '此裝置不支援定位' }
    emit()
    return
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (!current) return
      const prev = current.dist
      const d = distanceMeters(pos.coords.latitude, pos.coords.longitude, current.lat, current.lng)
      const shouldFire = !current.fired && d <= ALARM_FIRE_M
      // 一設鬧鐘已經喺範圍內(第一個 fix 就 <400m)→ 靜默進入提示狀態,唔嘈醒你
      const silently = shouldFire && prev == null
      current = { ...current, dist: d, fired: current.fired || shouldFire, geoError: undefined }
      if (shouldFire && !silently) {
        alertAll(
          '🔔 就快到站喇!',
          `${current.routeLabel} · ${current.stopName} 前約 ${Math.round(d)} 米,準備落車~`,
        )
      }
      emit()
    },
    (err) => {
      if (!current) return
      current = { ...current, geoError: err.code === 1 ? '定位權限被拒' : '暫時攞唔到位置' }
      emit()
    },
    { enableHighAccuracy: true, maximumAge: 5000 },
  )
}

export function stopAlarm(): void {
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
  if (current) {
    current = null
    emit()
  }
}
