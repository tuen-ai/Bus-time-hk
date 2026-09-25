import districts from '../data/hkDistricts.json'
import type { Weather } from '../api/weather'
import { distanceMeters } from './geo'

/** 由座標搵最近嘅 HKO 分區名 */
export function nearestDistrict(lat: number, lng: number): string {
  let best = districts[0]
  let bestD = Infinity
  for (const d of districts) {
    const dist = distanceMeters(lat, lng, d.lat, d.lng)
    if (dist < bestD) {
      bestD = dist
      best = d
    }
  }
  return best.name
}

// ---- 天氣門檻(顯示模式 / 公仔 / 天氣列 / 地圖雨點共用一套,唔好各自抄)----
/** 過去一小時雨量 ≥ 呢個數(mm)= 「落緊雨」,亦係 rainLevel 中雨嘅起點 */
export const RAIN_MM = 5
export const HOT_C = 33
export const COLD_C = 12

export type RainLevel = 'none' | 'light' | 'moderate' | 'heavy'

/** 過去一小時雨量(mm)→ 等級 */
export function rainLevel(mm: number): RainLevel {
  if (mm <= 0.2) return 'none'
  if (mm < RAIN_MM) return 'light'
  if (mm < 15) return 'moderate'
  return 'heavy'
}

export const rainLabel: Record<RainLevel, string> = {
  none: '無雨',
  light: '微雨',
  moderate: '中雨',
  heavy: '大雨',
}

// ---- HKO 警告代碼 ----
/** 熱帶氣旋警告(TC1 / TC3 / TC8NE… / TC10) */
export const isTyphoonCode = (code: string): boolean => code.startsWith('TC')
/** 暴雨警告(WRAINA 黃 / WRAINR 紅 / WRAINB 黑) */
export const isRainWarnCode = (code: string): boolean => code.startsWith('WRAIN')

export type WarnLevel = 'amber' | 'red' | 'black'

/** 警告嚴重程度(天氣列 chip 顏色):黑雨 = 黑;紅雨、八號或以上 = 紅;其餘 = 黃 */
export function warnLevel(code: string): WarnLevel {
  if (code.startsWith('WRAINB')) return 'black'
  if (code.startsWith('WRAINR')) return 'red'
  if (/^TC(8|9|10)/.test(code)) return 'red'
  return 'amber'
}

export interface WeatherMood {
  /** 掛緊風球 */
  typhoon: boolean
  /** 暴雨警告,或者任何分區過去一小時 ≥ RAIN_MM */
  rainy: boolean
  hot: boolean
  cold: boolean
  /** 要帶遮(打風或者落雨) */
  umbrella: boolean
  /** 一句提示:打風 > 落雨 > 熱 > 凍;冇特別 = null(各 component 想用自己講法就睇上面啲 flag) */
  line: string | null
}

const MOOD_LINE = {
  typhoon: '打緊風,留意班次安排 🌀',
  rainy: '落緊雨帶遮呀 ☔',
  hot: '好熱呀,注意補水 🥵',
  cold: '凍呀,着多件衫 🧣',
} as const

/** 天氣 → 分類(單一來源:DisplayMode / Mascots 都用呢個判斷;天氣列 chip 顏色就用 warnLevel) */
export function weatherMood(w: Weather | null): WeatherMood {
  if (!w) return { typhoon: false, rainy: false, hot: false, cold: false, umbrella: false, line: null }
  const codes = w.warnings.map((x) => x.code)
  const typhoon = codes.some(isTyphoonCode)
  const rainy = codes.some(isRainWarnCode) || Object.values(w.rainfall).some((mm) => mm >= RAIN_MM)
  const hot = w.tempC != null && w.tempC >= HOT_C
  const cold = w.tempC != null && w.tempC <= COLD_C
  const line = typhoon
    ? MOOD_LINE.typhoon
    : rainy
      ? MOOD_LINE.rainy
      : hot
        ? MOOD_LINE.hot
        : cold
          ? MOOD_LINE.cold
          : null
  return { typhoon, rainy, hot, cold, umbrella: typhoon || rainy, line }
}
