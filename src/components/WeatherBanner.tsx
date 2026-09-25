import { lazy, Suspense, useState, type CSSProperties } from 'react'
import { getWeather, type Weather } from '../api/weather'
import { usePolling } from '../hooks/usePolling'
import { warnLevel } from '../lib/weather'

// 面板連 Leaflet 地圖 —— 撳開先載入
const WeatherPanel = lazy(() => import('./WeatherPanel'))

// 收埋時面板唔喺 DOM → aria-controls 只喺打開時先指過去(載入中嘅 fallback 都用同一個 id)
const PANEL_ID = 'wx-panel'

// 淨係讀屏聽到(icon 係 aria-hidden,要補返文字)
const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}

export default function WeatherBanner() {
  const [w, setW] = useState<Weather | null>(null)
  const [open, setOpen] = useState(false)

  // api 層 4 分鐘快取(短過呢度 5 分鐘 tick);攞唔到警告會回上次成功嘅天氣,唔會亂報「天氣正常」
  usePolling(
    () =>
      getWeather()
        .then(setW)
        .catch(() => {}),
    5 * 60_000,
  )

  if (!w) return null
  const hasWarn = w.warnings.length > 0
  if (!hasWarn && w.tempC == null) return null

  return (
    <>
      <button
        type="button"
        className={`weather-bar ${hasWarn ? 'has-warn' : ''}`}
        style={{ minHeight: 44 }}
        aria-expanded={open}
        aria-controls={open ? PANEL_ID : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {w.tempC != null && (
          <span className="wx-temp">
            <span aria-hidden="true">🌡 </span>
            <span style={SR_ONLY}>氣溫 </span>
            {Math.round(w.tempC)}°
          </span>
        )}
        {w.humidity != null && (
          <span className="muted small">
            <span aria-hidden="true">💧</span>
            <span style={SR_ONLY}>濕度 </span>
            {Math.round(w.humidity)}%
          </span>
        )}
        {w.warnings.map((warn) => (
          <span key={warn.code} className={`wx-warn w-${warnLevel(warn.code)}`}>
            <span aria-hidden="true">⚠️ </span>
            {warn.name}
          </span>
        ))}
        {!hasWarn && <span className="muted small">天氣正常</span>}
        <span className="wx-more">
          <span aria-hidden="true">🚦 </span>路況 <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </span>
      </button>
      {open && (
        <Suspense
          fallback={
            <div id={PANEL_ID} className="muted small" style={{ padding: '8px 14px' }} role="status">
              載入…
            </div>
          }
        >
          <WeatherPanel w={w} id={PANEL_ID} />
        </Suspense>
      )}
    </>
  )
}
