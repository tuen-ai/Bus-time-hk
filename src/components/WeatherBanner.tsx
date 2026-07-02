import { lazy, Suspense, useEffect, useState } from 'react'
import { getWeather, type Weather } from '../api/weather'

// 面板連 Leaflet 地圖 —— 撳開先載入
const WeatherPanel = lazy(() => import('./WeatherPanel'))

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
  const [open, setOpen] = useState(false)

  useEffect(() => {
    getWeather()
      .then(setW)
      .catch(() => {})
  }, [])

  if (!w) return null
  const hasWarn = w.warnings.length > 0
  if (!hasWarn && w.tempC == null) return null

  return (
    <>
      <button
        className={`weather-bar ${hasWarn ? 'has-warn' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {w.tempC != null && <span className="wx-temp">🌡 {Math.round(w.tempC)}°</span>}
        {w.humidity != null && <span className="muted small">💧{Math.round(w.humidity)}%</span>}
        {w.warnings.map((warn) => (
          <span key={warn.code} className={`wx-warn ${warnClass(warn.code)}`}>
            ⚠️ {warn.name}
          </span>
        ))}
        {!hasWarn && <span className="muted small">天氣正常</span>}
        <span className="wx-more">
          🚦 路況 {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <Suspense fallback={<div className="muted small" style={{ padding: '8px 14px' }}>載入…</div>}>
          <WeatherPanel w={w} />
        </Suspense>
      )}
    </>
  )
}
