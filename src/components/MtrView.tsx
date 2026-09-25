import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import { MTR_LINES, getLine } from '../lib/mtrData'
import { TILE_URL, TILE_ATTRIB, TOUCH_MAP_HINT, isTouchMap } from '../lib/mapConfig'
import { prefersReducedMotion, scrollBehavior } from '../lib/motion'
import { getMtrLast, setMtrLast, type MtrLast } from '../lib/mtrFavs'
import { useWheelZoomOnFocus } from '../hooks/useWheelZoomOnFocus'
import MtrSchedulePanel from './MtrSchedulePanel'

function MapFocus({
  bounds,
  focus,
}: {
  bounds: LatLngBoundsExpression | null
  focus: [number, number] | null
}) {
  const map = useMap()
  useWheelZoomOnFocus() // 滾輪唔再一經過就食咗捲頁
  useEffect(() => {
    // 減少動態效果:唔好 flyTo 飛過去,直接跳
    const reduce = prefersReducedMotion()
    if (focus) {
      if (reduce) map.setView(focus, 16, { animate: false })
      else map.flyTo(focus, 16, { duration: 0.6 })
    } else if (bounds) map.fitBounds(bounds, { padding: [24, 24], animate: !reduce })
  }, [bounds, focus, map])
  return null
}

/** 開頁:用返上次揀嘅綫 / 站(首頁港鐵收藏撳入嚟都係經呢度);冇就預設荃灣綫 */
const restoreLast = (): MtrLast => getMtrLast() ?? { line: 'TWL', sta: null }

export default function MtrView() {
  const [init] = useState(restoreLast)
  const [lineCode, setLineCode] = useState(init.line)
  const [station, setStation] = useState<string | null>(init.sta)
  // 換綫 / 開站就記低,下次入嚟唔使由頭揀
  useEffect(() => setMtrLast({ line: lineCode, sta: station }), [lineCode, station])

  // 一入嚟有站打開咗:捲到嗰個站(只捲呢一次,之後用家自己撳唔會再捲)。
  // 焦點跌咗落 body(即係由首頁收藏卡撳入嚟,張卡已經冇咗)先將焦點放上個站,撳 tab 入嚟唔搶焦點
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (!init.sta) return
    const raf = requestAnimationFrame(() => {
      const btn = listRef.current?.querySelector<HTMLElement>(`[data-sta="${init.sta}"] .stop-main`)
      if (!btn) return
      const a = document.activeElement
      if (!a || a === document.body) btn.focus({ preventScroll: true })
      btn.scrollIntoView?.({ block: 'center', behavior: scrollBehavior() })
    })
    return () => cancelAnimationFrame(raf)
  }, [init])
  // 觸控機:一隻手指捲頁,兩隻手指先郁地圖(唔好一掃就被地圖食咗);MapContainer 只睇第一次 render
  const [touch] = useState(isTouchMap)

  const line = getLine(lineCode) ?? MTR_LINES[0]
  const color = line.color

  const geoStops = useMemo(() => line.stations.filter((s) => s.lat != null && s.lng != null), [line])
  const positions = useMemo<[number, number][]>(
    () => geoStops.map((s) => [s.lat as number, s.lng as number]),
    [geoStops],
  )
  const focus = useMemo<[number, number] | null>(() => {
    const s = line.stations.find((x) => x.code === station)
    return s && s.lat != null && s.lng != null ? [s.lat, s.lng] : null
  }, [station, line])

  return (
    <div>
      {/* 路線選擇:綫色經 --line-c 交畀 CSS 揀對比夠嘅字色 */}
      <div className="mtr-lines">
        {MTR_LINES.map((l) => {
          const on = l.code === lineCode
          return (
            <button
              key={l.code}
              type="button"
              className={`mtr-line-chip ${on ? 'on' : ''}`}
              aria-pressed={on}
              style={{ '--line-c': l.color } as CSSProperties}
              onClick={() => {
                setLineCode(l.code)
                setStation(null)
              }}
            >
              <span className="mtr-dot" aria-hidden="true" />
              {l.nameTc}
            </button>
          )
        })}
      </div>

      {/* 地圖 */}
      {positions.length > 1 && (
        <div className="route-map-wrap">
          <MapContainer
            className="map"
            center={positions[0]}
            zoom={12}
            scrollWheelZoom={false}
            dragging={!touch}
          >
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} />
            <MapFocus bounds={positions} focus={focus} />
            <Polyline positions={positions} pathOptions={{ color, weight: 5, opacity: 0.85 }} />
            {geoStops.map((s) => {
              const on = s.code === station
              return (
                <CircleMarker
                  key={s.code}
                  center={[s.lat as number, s.lng as number]}
                  radius={on ? 7 : 4}
                  pathOptions={{
                    color: '#fff',
                    weight: 2,
                    fillColor: on ? '#f59e0b' : color,
                    fillOpacity: 1,
                  }}
                  eventHandlers={{ click: () => setStation(s.code) }}
                />
              )
            })}
          </MapContainer>
          {touch && <div className="map-disclaimer">{TOUCH_MAP_HINT}</div>}
        </div>
      )}

      {/* 車站列表 */}
      <ol className="stop-list" ref={listRef}>
        {line.stations.map((s) => {
          const open = s.code === station
          const icLines = s.interchange.map((ic) => getLine(ic)).filter((l) => l != null)
          return (
            <li key={s.code} className={`stop-item ${open ? 'open' : ''}`} data-sta={s.code}>
              <button
                className="stop-main"
                aria-expanded={open}
                onClick={() => setStation(open ? null : s.code)}
              >
                <span className="mtr-dot" style={{ background: color }} aria-hidden="true" />
                <span className="stop-name">
                  {s.nameTc}
                  {/* 轉車綫寫埋名,唔止得色點 */}
                  {icLines.length > 0 && (
                    <span className="mtr-ic-names">轉{icLines.map((l) => l.nameTc).join('、')}</span>
                  )}
                </span>
                {icLines.map((l) => (
                  <span key={l.code} className="mtr-ic" style={{ background: l.color }} aria-hidden="true" />
                ))}
                <span className="chev" aria-hidden="true">
                  {open ? '▾' : '▸'}
                </span>
              </button>
              {open && <MtrSchedulePanel line={lineCode} station={s.code} color={color} />}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
