// 香港天文台 (HKO) 開放數據 API
// 文件: https://data.weather.gov.hk/weatherAPI/doc/HKO_Open_Data_API_Documentation.pdf
// 免 key、免費、支援 CORS。
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

let cache: { ts: number; data: Weather } | null = null
const TTL = 5 * 60 * 1000

async function getJson<T>(dataType: string): Promise<T> {
  const res = await fetch(`${BASE}?dataType=${dataType}&lang=tc`)
  if (!res.ok) throw new Error(`HKO ${res.status}`)
  return res.json() as Promise<T>
}

export async function getWeather(): Promise<Weather> {
  if (cache && Date.now() - cache.ts < TTL) return cache.data

  type WarnSum = Record<string, { name?: string; code?: string; actionCode?: string }>
  type Current = {
    temperature?: { data?: { place: string; value: number }[] }
    humidity?: { data?: { place: string; value: number }[] }
    rainfall?: { data?: { place: string; max?: number; unit?: string }[] }
  }
  const [warn, current] = await Promise.all([
    getJson<WarnSum>('warnsum').catch((): WarnSum => ({})),
    getJson<Current>('rhrread').catch((): Current => ({})),
  ])

  const warnings: Warning[] = Object.values(warn)
    .filter((w) => w && w.actionCode !== 'CANCEL' && w.name)
    .map((w) => ({ code: String(w.code ?? ''), name: String(w.name) }))

  const temps = current.temperature?.data ?? []
  const hko = temps.find((t) => t.place === '香港天文台')
  const tempC = hko?.value ?? temps[0]?.value ?? null
  const humidity = current.humidity?.data?.[0]?.value ?? null

  const rainfall: Record<string, number> = {}
  for (const r of current.rainfall?.data ?? []) {
    rainfall[r.place] = r.max ?? 0
  }

  const data: Weather = { tempC, humidity, warnings, rainfall, updatedAt: Date.now() }
  cache = { ts: Date.now(), data }
  return data
}
