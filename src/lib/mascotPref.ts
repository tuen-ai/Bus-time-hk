// 設定:公仔揀邊套 —— 原創熊貓 + 啡熊(預設)/ 長草顏團子(預覽,素材要本機另外下載)
import { useSyncExternalStore } from 'react'
import { lsGet, lsSet } from './ls'

export const MASCOT_KEY = 'kkcx.mascot'
export type MascotSet = 'classic' | 'dango'
const EVT = 'kkcx:mascot'

export const getMascotSet = (): MascotSet => (lsGet(MASCOT_KEY) === 'dango' ? 'dango' : 'classic')

export function setMascotSet(v: MascotSet): void {
  lsSet(MASCOT_KEY, v)
  window.dispatchEvent(new Event(EVT))
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVT, cb)
    window.removeEventListener('storage', cb)
  }
}

/** 已經 mount 咗嘅公仔喺設定一改就換(唔使重載) */
export const useMascotSet = (): MascotSet => useSyncExternalStore(subscribe, getMascotSet, () => 'classic')

// 團子素材唔喺度(正式部署冇):第一次載入失敗就記住,之後唔使逐個試
let dangoMissing = false
export const dangoAssetsMissing = () => dangoMissing
export const markDangoMissing = () => {
  dangoMissing = true
}
/** 測試用 */
export const resetDangoMissing = () => {
  dangoMissing = false
}
