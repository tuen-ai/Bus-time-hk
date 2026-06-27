import { useEffect, useState } from 'react'
import { getWeather, type Weather } from '../api/weather'

// 暴雨/颱風等警告用代碼前綴判斷顏色
function warnClass(code: string): string {
  if (code.startsWith('WRAINR')) return 'w-red'
  if (code.startsWith('WRAINB')) return 'w-black'
  if (code.startsWith('WRAINA')) return 'w-amber'
  if (code.startsWith('TC8') || code.startsWith('TC9') || code.startsWith('TC10')) return 'w-red'
  if (code.startsWith('TC')) return 'w-amber'
  return 'w-amber'
}

export default function WeatherBanner() {
  const [w, setW] = useState<Weather | null>(null)

  useEffect(() => {
    getWeather()
      .then(setW)
      .catch(() => {})
  }, [])

  if (!w) return null
  const hasWarn = w.warnings.length > 0
  if (!hasWarn && w.tempC == null) return null

  return (
    <div className={`weather-bar ${hasWarn ? 'has-warn' : ''}`}>
      {w.tempC != null && <span className="wx-temp">🌡 {Math.round(w.tempC)}°</span>}
      {w.warnings.map((warn) => (
        <span key={warn.code} className={`wx-warn ${warnClass(warn.code)}`}>
          ⚠️ {warn.name}
        </span>
      ))}
      {!hasWarn && <span className="muted small">天氣正常</span>}
    </div>
  )
}
