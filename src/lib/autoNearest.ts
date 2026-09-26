// 設定:由搜尋開路線時,自動打開離你最近嘅站(預設開;入備份)
import { lsGet, lsSet } from './ls'

export const AUTO_NEAREST_KEY = 'kkcx.autoNearest'

export const autoNearestOn = (): boolean => lsGet(AUTO_NEAREST_KEY) !== '0'

export const setAutoNearest = (on: boolean): void => lsSet(AUTO_NEAREST_KEY, on ? '1' : '0')
