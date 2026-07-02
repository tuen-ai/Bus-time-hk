// 展開式天氣 + 路況面板:詳細天氣、全港路況地圖(TSM 車速)、特別交通消息。
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Polyline } from 'react-leaflet'
import type { Weather } from '../api/weather'
import { fetchTsm, type TsmData, type TsmLevel } from '../api/tsm'
import { fetchTrafficNews, type Notice } from '../api/stn'
import { TILE_URL, TILE_ATTRIB } from '../lib/mapConfig'

const LEVEL_COLOR: Record<TsmLevel, string> = {
  good: '#2fbf9a',
  avg: '#ff8f43',
  bad: '#ff4d6d',
}
const REFRESH_MS = 2 * 60 * 1000

export default function WeatherPanel({ w }: { w: Weather }) {
  const [tsm, setTsm] = useState<TsmData | null | 'loading'>('loading')
  const [news, setNews] = useState<Notice[]>([])
  const [showAllNews, setShowAllNews] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => {
      fetchTsm().then((d) => alive && setTsm(d))
    }
    load()
    fetchTrafficNews().then((n) => alive && setNews(n))
    const id = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  // 最大雨量分區(有雨先顯示)
  const rainTop = Object.entries(w.rainfall)
    .filter(([, mm]) => mm > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  const shownNews = showAllNews ? news : news.slice(0, 4)

  return (
    <div className="wx-panel">
      <div className="wx-stats">
        {w.tempC != null && (
          <div className="wx-stat">
            <span className="wx-stat-v">{Math.round(w.tempC)}°C</span>
            <span className="wx-stat-l">氣溫</span>
          </div>
        )}
        {w.humidity != null && (
          <div className="wx-stat">
            <span className="wx-stat-v">{Math.round(w.humidity)}%</span>
            <span className="wx-stat-l">濕度</span>
          </div>
        )}
        <div className="wx-stat">
          <span className="wx-stat-v">{rainTop.length ? `${rainTop[0][1]}mm` : '0mm'}</span>
          <span className="wx-stat-l">{rainTop.length ? `${rainTop[0][0]}雨量` : '過去1小時雨量'}</span>
        </div>
      </div>
      {rainTop.length > 1 && (
        <div className="muted small" style={{ margin: '2px 2px 8px' }}>
          ☔ {rainTop.map(([d, mm]) => `${d} ${mm}mm`).join(' · ')}
        </div>
      )}

      <div className="wx-sec">🚦 全港路況(主要道路車速)</div>
      {tsm === 'loading' && <div className="muted small pad">載入路況…</div>}
      {tsm === null && (
        <div className="muted small" style={{ margin: '4px 2px 10px' }}>
          路況圖暫時未有資料(下方交通消息仍然有效)。
        </div>
      )}
      {tsm && tsm !== 'loading' && (
        <>
          <div className="tsm-map-wrap">
            <MapContainer
              center={[22.36, 114.12]}
              zoom={11}
              className="map tsm-map"
              scrollWheelZoom={false}
              attributionControl={false}
            >
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} />
              {tsm.segs.map((s) => (
                <Polyline
                  key={s.id}
                  positions={s.path}
                  pathOptions={{
                    color: LEVEL_COLOR[s.level],
                    weight: s.level === 'bad' ? 5 : 4,
                    opacity: 0.85,
                  }}
                />
              ))}
            </MapContainer>
          </div>
          <div className="tsm-legend">
            <span><i style={{ background: LEVEL_COLOR.good }} />暢順</span>
            <span><i style={{ background: LEVEL_COLOR.avg }} />一般</span>
            <span><i style={{ background: LEVEL_COLOR.bad }} />擠塞</span>
            <span className="muted small" style={{ marginLeft: 'auto' }}>
              {tsm.capturedAt ? `資料時間 ${tsm.capturedAt.slice(11, 16) || tsm.capturedAt}` : ''} · 每2分鐘更新
            </span>
          </div>
        </>
      )}

      {news.length > 0 && (
        <>
          <div className="wx-sec">🚧 特別交通消息({news.length})</div>
          <ul className="wx-news">
            {shownNews.map((n) => (
              <li key={n.id || n.heading}>
                <b>{n.heading || '交通消息'}</b>
                {n.detail && n.detail !== n.heading && <div className="muted small">{n.detail}</div>}
              </li>
            ))}
          </ul>
          {news.length > 4 && (
            <button className="refresh-btn" onClick={() => setShowAllNews((v) => !v)}>
              {showAllNews ? '收埋' : `仲有 ${news.length - 4} 條…`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
