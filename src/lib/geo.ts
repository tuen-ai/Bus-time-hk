import { zhErrorOr } from './errorText'

// 地理距離計算(Haversine,單位:米)
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} 米`
  return `${(m / 1000).toFixed(1)} 公里`
}

function once(opts: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opts))
}

/** 用家拒絕咗定位權限(唔好喺背景再問) */
export const isGeoDenied = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as GeolocationPositionError).code === 1

/** watchPosition:GPS 一有 fix 即取,自設 timeout(對手機較可靠) */
function watch(timeoutMs: number, maxAgeMs: number): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let done = false
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (done) return
        done = true
        navigator.geolocation.clearWatch(id)
        resolve(pos)
      },
      (err) => {
        if (done) return
        done = true
        navigator.geolocation.clearWatch(id)
        reject(err)
      },
      { enableHighAccuracy: true, maximumAge: maxAgeMs },
    )
    setTimeout(() => {
      if (done) return
      done = true
      navigator.geolocation.clearWatch(id)
      reject(Object.assign(new Error('定位逾時'), { code: 3 }))
    }, timeoutMs)
  })
}

export interface LatLngFix {
  lat: number
  lng: number
}

// 最近一次成功定位(記憶體):連續開幾條線唔使次次等 GPS
let lastFix: (LatLngFix & { at: number; accuracy: number }) | null = null
const remember = (pos: GeolocationPosition): void => {
  lastFix = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    // 用位置本身嘅時間(快取位置可能舊咗);有啲機報未來時間就當而家,唔好令舊位置一直當新
    at: Math.min(pos.timestamp || Date.now(), Date.now()),
  }
}

export interface PositionOpts {
  /** 最舊接受幾耐之前嘅瀏覽器快取位置(ms),預設 10 分鐘。「附近」要而家嘅位置就畀細啲 */
  maxAgeMs?: number
}

/**
 * 取得目前位置:
 *  1. 先試低精度 + 接受 maxAgeMs 內嘅快取(最快,室內都易中)
 *  2. 失敗(非權限問題)就用 watchPosition 等 GPS 首個 fix(最長 35 秒)
 */
export async function getPosition({ maxAgeMs = 600_000 }: PositionOpts = {}): Promise<GeolocationPosition> {
  if (!('geolocation' in navigator)) throw new Error('此裝置不支援定位')
  let pos: GeolocationPosition
  try {
    pos = await once({ enableHighAccuracy: false, timeout: 9000, maximumAge: maxAgeMs })
  } catch (e) {
    if (isGeoDenied(e)) throw e
    pos = await watch(35000, maxAgeMs)
  }
  remember(pos)
  return pos
}

// 「最近你嘅站」:幾耐內 / 幾準嘅記憶體定位可以直接用;高精度最多等幾耐;幾準就唔使再等
const NEAR_REUSE_MS = 30_000
const NEAR_REUSE_M = 50
const NEAR_WAIT_MS = 5_000
const NEAR_GOOD_M = 30

/**
 * 高精度定位(GPS)最多等 timeoutMs:精度去到 goodM 米內即刻返;時間到就返暫時最準嗰個(一個都冇 → null)。
 * 拒絕權限即刻 reject;其他錯誤(暫時冇訊號)照等,可能之後有 fix。
 */
function bestFixWithin(timeoutMs: number, goodM: number): Promise<GeolocationPosition | null> {
  return new Promise((resolve, reject) => {
    let best: GeolocationPosition | null = null
    let done = false
    // watch id 放入 object:同步 callback 嗰陣 watchPosition 未返,id 仲未有
    const w: { id?: number } = {}
    const finish = (settle: () => void) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (w.id !== undefined) navigator.geolocation.clearWatch(w.id)
      settle()
    }
    const timer = setTimeout(() => finish(() => resolve(best)), timeoutMs)
    w.id = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos
        if (pos.coords.accuracy <= goodM) finish(() => resolve(pos))
      },
      (err) => {
        if (isGeoDenied(err)) finish(() => reject(err))
      },
      { enableHighAccuracy: true, maximumAge: 10_000 },
    )
    // 有啲實作會喺 watchPosition 入面同步 callback:嗰陣清唔到,喺度補清
    if (done) navigator.geolocation.clearWatch(w.id)
  })
}

/**
 * 「最近你嘅站」用嘅定位:要準 —— 旺角咁密,差 100 米就會揀錯隔籬站。
 *  1. 30 秒內定過位而且夠準(≤ 50 米)→ 即刻用返(連續開幾條線唔使再等)
 *  2. 高精度最多等 5 秒:去到 ≤ 30 米即刻用;時間到就用暫時最準嗰個
 *  3. 5 秒都冇任何位置(室內等)→ 退返 getPosition(低精度 / 2 分鐘內快取,再唔得等 GPS)
 */
export async function getNearbyFix(): Promise<LatLngFix> {
  if (lastFix && Date.now() - lastFix.at < NEAR_REUSE_MS && lastFix.accuracy <= NEAR_REUSE_M)
    return { lat: lastFix.lat, lng: lastFix.lng }
  if (!('geolocation' in navigator)) throw new Error('此裝置不支援定位')
  const best = await bestFixWithin(NEAR_WAIT_MS, NEAR_GOOD_M)
  if (best) remember(best)
  const pos = best ?? (await getPosition({ maxAgeMs: 120_000 }))
  return { lat: pos.coords.latitude, lng: pos.coords.longitude }
}

/** 測試用:清走記憶體定位 */
export function _resetGeoForTests(): void {
  lastFix = null
}

/**
 * 定位權限狀態,用嚟決定可唔可以喺背景自動定位(拒絕咗就唔好再試,免得煩)。
 * 舊 iOS 冇 Permissions API → 'unknown'(照試,第一次會問)。
 */
export async function geoPermission(): Promise<PermissionState | 'unknown'> {
  try {
    const st = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
    return st?.state ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function describeGeoError(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = (e as GeolocationPositionError).code
    if (code === 1) return '定位權限被拒絕。請喺瀏覽器設定開啟「位置」權限,再按重試。'
    if (code === 2) return '暫時取得唔到位置(室內或訊號弱),請行去空曠位置再試。'
    if (code === 3) return '定位逾時。請確認手機「定位服務 / GPS」已開啟,並喺空曠位置或近窗口再試。'
  }
  if (!window.isSecureContext) return '定位需要 HTTPS 安全連線。'
  // 只顯示自己寫嘅中文訊息;其他(英文)錯誤唔好直接出俾用家睇
  return zhErrorOr(e, '定位失敗,請再試。')
}
