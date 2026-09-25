// 香港天文台 (HKO) 開放數據 API
// 文件: https://data.weather.gov.hk/weatherAPI/doc/HKO_Open_Data_API_Documentation.pdf
// 免 key、免費、支援 CORS。
import { memoAsync } from '../lib/cache'
import { fetchJson } from '../lib/http'

const BASE = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php'

export interface Warning {
  code: string
  name: string
}

export interface Weather {
  tempC: number | null
  humidity: number | null
  warnings: Warning[]
  /** 分區過去一小時雨量(mm),key = HKO 分區名 */
  rainfall: Record<string, number>
  updatedAt: number
}

// WeatherBanner 每 5 分鐘 tick;TTL 要短過 tick 週期,否則 tick 會攞 stale cache(實際變 10 分鐘先更新)
const TTL = 4 * 60 * 1000
const TIMEOUT_MS = 10_000
// 即時天氣攞唔到 → 沿用上次氣溫/雨量,但太舊就唔好扮新
const CURRENT_STALE_MS = 30 * 60 * 1000

export type WarnSum = Record<string, { name?: string; code?: string; actionCode?: string } | null>

export interface Current {
  temperature?: { data?: { place: string; value: number }[] }
  humidity?: { data?: { place: string; value: number }[] }
  rainfall?: { data?: { place: string; max?: number; unit?: string }[] }
}

function hko<T>(dataType: string): Promise<T> {
  return fetchJson<T>(`${BASE}?dataType=${dataType}&lang=tc`, { timeoutMs: TIMEOUT_MS })
}

/** 警告摘要 → 生效中嘅警告(CANCEL 咗 / 冇名嘅唔要) */
export function parseWarnings(warn: WarnSum): Warning[] {
  const out: Warning[] = []
  for (const w of Object.values(warn)) {
    if (!w || w.actionCode === 'CANCEL' || !w.name) continue
    out.push({ code: String(w.code ?? ''), name: String(w.name) })
  }
  return out
}

/** 警告 + 即時天氣 → Weather(純函數,方便測試) */
export function buildWeather(warn: WarnSum, current: Current, now = Date.now()): Weather {
  const temps = current.temperature?.data ?? []
  const hkoTemp = temps.find((t) => t.place === '香港天文台')
  const tempC = hkoTemp?.value ?? temps[0]?.value ?? null
  const humidity = current.humidity?.data?.[0]?.value ?? null

  const rainfall: Record<string, number> = {}
  for (const r of current.rainfall?.data ?? []) {
    rainfall[r.place] = r.max ?? 0
  }

  return { tempC, humidity, warnings: parseWarnings(warn), rainfall, updatedAt: now }
}

let lastCurrent: { at: number; data: Current } | null = null

async function fetchWeather(): Promise<Weather> {
  const [warnR, curR] = await Promise.allSettled([hko<WarnSum>('warnsum'), hko<Current>('rhrread')])
  const now = Date.now()
  // 即時天氣攞到就先記低(就算下面警告失敗要拋錯,下次都有新鮮氣溫可以用)
  if (curR.status === 'fulfilled') lastCurrent = { at: now, data: curR.value }
  // 警告最緊要:攞唔到就拋錯,memoAsync 會回上次成功嘅天氣
  // (千祈唔好當「冇警告」—— 打八號風球時顯示「天氣正常」)
  if (warnR.status === 'rejected') throw warnR.reason
  const current: Current = lastCurrent && now - lastCurrent.at < CURRENT_STALE_MS ? lastCurrent.data : {}
  return buildWeather(warnR.value, current, now)
}

/** 天氣摘要(4 分鐘快取;同時多個 caller 共用一次請求;失敗回上次成功嘅值) */
export const getWeather: () => Promise<Weather> = memoAsync(fetchWeather, TTL)
