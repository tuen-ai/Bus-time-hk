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

const isPermissionDenied = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as GeolocationPositionError).code === 1

/** watchPosition:GPS 一有 fix 即取,自設 timeout(對手機較可靠) */
function watch(timeoutMs: number): Promise<GeolocationPosition> {
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
      { enableHighAccuracy: true, maximumAge: 600000 },
    )
    setTimeout(() => {
      if (done) return
      done = true
      navigator.geolocation.clearWatch(id)
      reject(Object.assign(new Error('定位逾時'), { code: 3 }))
    }, timeoutMs)
  })
}

/**
 * 取得目前位置:
 *  1. 先試低精度 + 接受 10 分鐘快取(最快,室內都易中)
 *  2. 失敗(非權限問題)就用 watchPosition 等 GPS 首個 fix(最長 35 秒)
 */
export async function getPosition(): Promise<GeolocationPosition> {
  if (!('geolocation' in navigator)) throw new Error('此裝置不支援定位')
  try {
    return await once({ enableHighAccuracy: false, timeout: 9000, maximumAge: 600000 })
  } catch (e) {
    if (isPermissionDenied(e)) throw e
    return await watch(35000)
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
  return e instanceof Error ? e.message : '定位失敗,請再試。'
}
