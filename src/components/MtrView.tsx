import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import { MTR_LINES, getLine } from '../lib/mtrData'
import { TILE_URL, TILE_ATTRIB } from '../lib/mapConfig'
import MtrSchedulePanel from './MtrSchedulePanel'

function MapFocus({
  bounds,
  focus,
}: {
  bounds: LatLngBoundsExpression | null
  focus: [number, number] | null
}) {
  const map = useMap()
  useEffect(() => {
    if (focus) map.flyTo(focus, 16, { duration: 0.6 })
    else if (bounds) map.fitBounds(bounds, { padding: [24, 24] })
  }, [bounds, focus, map])
  return null
}

export default function MtrView() {
  const [lineCode, setLineCode] = useState('TWL')
  const [station, setStation] = useState<string | null>(null)

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
      {/* 路線選擇 */}
      <div className="mtr-lines">
        {MTR_LINES.map((l) => (
          <button
            key={l.code}
            className={`mtr-line-chip ${l.code === lineCode ? 'on' : ''}`}
            style={
              l.code === lineCode
                ? { background: l.color, borderColor: l.color, color: '#fff' }
                : { borderColor: l.color, color: l.color }
            }
            onClick={() => {
              setLineCode(l.code)
              setStation(null)
            }}
          >
            {l.nameTc}
          </button>
        ))}
      </div>

      {/* 地圖 */}
      {positions.length > 1 && (
        <MapContainer className="map" center={positions[0]} zoom={12} scrollWheelZoom>
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
      )}

      {/* 車站列表 */}
      <ol className="stop-list">
        {line.stations.map((s) => {
          const open = s.code === station
          return (
            <li key={s.code} className={`stop-item ${open ? 'open' : ''}`}>
              <button
                className="stop-main"
                aria-expanded={open}
                onClick={() => setStation(open ? null : s.code)}
              >
                <span className="mtr-dot" style={{ background: color }} />
                <span className="stop-name">{s.nameTc}</span>
                {s.interchange.map((ic) => {
                  const l = getLine(ic)
                  return l ? (
                    <span key={ic} className="mtr-ic" style={{ background: l.color }} title={l.nameTc} />
                  ) : null
                })}
                <span className="chev">{open ? '▾' : '▸'}</span>
              </button>
              {open && <MtrSchedulePanel line={lineCode} station={s.code} color={color} />}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
