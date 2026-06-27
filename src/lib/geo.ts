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

/** 取得目前位置(Promise 包裝 Geolocation API) */
export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('此裝置不支援定位'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000,
    })
  })
}

/** 將 Geolocation 錯誤轉成可讀、可行動嘅中文訊息 */
export function describeGeoError(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = (e as GeolocationPositionError).code
    if (code === 1)
      return '定位權限被拒絕。請喺瀏覽器網址列左邊嘅鎖頭圖示 → 開啟「位置」權限,再按「重新定位」。'
    if (code === 2)
      return '暫時取得唔到位置(可能室內或 GPS 訊號弱)。請行去空曠位置再試。'
    if (code === 3) return '定位逾時。請再試一次。'
  }
  if (!window.isSecureContext)
    return '定位需要 HTTPS 安全連線先用到。'
  return e instanceof Error ? e.message : '定位失敗,請再試。'
}
