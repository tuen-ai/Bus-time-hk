// 地理距離計算(Haversine,單位:米)
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} 米`
  return `${(m / 1000).toFixed(1)} 公里`
}

function once(opts: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, opts),
  )
}

/** 取得目前位置:先快速低精度+接受快取,失敗先試高精度長 timeout */
export async function getPosition(): Promise<GeolocationPosition> {
  if (!('geolocation' in navigator)) throw new Error('此裝置不支援定位')
  try {
    return await once({ enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 })
  } catch (e) {
    if (typeof e === 'object' && e !== null && (e as GeolocationPositionError).code === 1) throw e
    return await once({ enableHighAccuracy: true, timeout: 27000, maximumAge: 120000 })
  }
}

export function describeGeoError(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = (e as GeolocationPositionError).code
    if (code === 1)
      return '定位權限被拒絕。請喺瀏覽器設定開啟「位置」權限,再按重試。'
    if (code === 2) return '暫時取得唔到位置(室內或訊號弱),請行去空曠位置再試。'
    if (code === 3) return '定位逾時,請再試。'
  }
  if (!window.isSecureContext) return '定位需要 HTTPS 安全連線。'
  return e instanceof Error ? e.message : '定位失敗,請再試。'
}
