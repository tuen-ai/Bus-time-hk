import { useState, type ReactNode } from 'react'
import LocationPicker, { type PickedPlace } from './LocationPicker'
import { getPosition, describeGeoError } from '../lib/geo'
import { planJourneys, type Journey, type Leg } from '../lib/journey'
import {
  getPlaces,
  savePlace,
  PRESET_DEFS,
  type SavedPlace,
} from '../lib/places'

const LEG_COLOR: Record<string, string> = {
  kmb: '#c8102e', ctb: '#0e7490', nlb: '#00857c', gmb: '#167a3a', lightRail: '#7d3c98',
}

function renderLegs(legs: Leg[]) {
  const items: ReactNode[] = []
  legs.forEach((l, i) => {
    if (i > 0) items.push(<span key={`a${i}`} className="arrow">›</span>)
    if (l.kind === 'walk') {
      items.push(<span key={i} className="leg-walk">🚶{l.mins}分</span>)
    } else {
      items.push(
        <span key={i} className="leg-badge" style={{ background: LEG_COLOR[l.co ?? ''] ?? '#666' }}>
          {l.route}
        </span>,
      )
      if (l.nStops) items.push(<span key={`n${i}`} className="leg-n">{l.nStops}站</span>)
    }
  })
  return items
}

type Endpoint = PickedPlace | 'mylocation' | null

// 正在用 picker 設定緊嘅目標
type Picking =
  | { kind: 'origin' | 'dest'; title: string }
  | { kind: 'preset'; presetId: string; icon: string; title: string }
  | null

function epLabel(e: Endpoint): string {
  if (e === 'mylocation') return '📍 我的位置'
  if (e) return e.label
  return ''
}

export default function PlannerView() {
  const [origin, setOrigin] = useState<Endpoint>('mylocation')
  const [dest, setDest] = useState<Endpoint>(null)
  const [picking, setPicking] = useState<Picking>(null)
  const [places, setPlaces] = useState<SavedPlace[]>(getPlaces())
  const [results, setResults] = useState<Journey[] | null>(null)
  const [planning, setPlanning] = useState(false)
  const [planErr, setPlanErr] = useState<string | null>(null)

  const coordsOf = async (e: Endpoint): Promise<{ lat: number; lng: number } | null> => {
    if (e === 'mylocation') {
      const p = await getPosition()
      return { lat: p.coords.latitude, lng: p.coords.longitude }
    }
    if (e) return { lat: e.lat, lng: e.lng }
    return null
  }

  const doPlan = async () => {
    setPlanning(true)
    setPlanErr(null)
    setResults(null)
    try {
      const [oc, dc] = await Promise.all([coordsOf(origin), coordsOf(dest)])
      if (!oc || !dc) throw new Error('請先設定起點同終點')
      const js = await planJourneys(oc, dc)
      setResults(js)
    } catch (e) {
      setPlanErr(describeGeoError(e))
    } finally {
      setPlanning(false)
    }
  }

  const presetOf = (id: string) => places.find((p) => p.id === id)

  const onPick = (p: PickedPlace) => {
    if (!picking) return
    if (picking.kind === 'origin') setOrigin(p)
    else if (picking.kind === 'dest') setDest(p)
    else if (picking.kind === 'preset') {
      const sp: SavedPlace = {
        id: picking.presetId,
        label: PRESET_DEFS.find((d) => d.id === picking.presetId)?.label ?? p.label,
        icon: picking.icon,
        lat: p.lat,
        lng: p.lng,
        address: p.label,
      }
      setPlaces(savePlace(sp))
    }
    setPicking(null)
  }

  const usePreset = (id: string) => {
    const sp = presetOf(id)
    const def = PRESET_DEFS.find((d) => d.id === id)!
    if (sp) {
      setDest({ label: `${sp.icon} ${sp.label}`, lat: sp.lat, lng: sp.lng })
    } else {
      setPicking({ kind: 'preset', presetId: id, icon: def.icon, title: `設定:${def.icon} ${def.label}` })
    }
  }

  if (picking) {
    return (
      <LocationPicker
        title={picking.title}
        onConfirm={onPick}
        onCancel={() => setPicking(null)}
      />
    )
  }

  const swap = () => {
    setOrigin(dest)
    setDest(origin)
  }

  return (
    <div>
      <div className="plan-card">
        <button
          className="plan-field"
          onClick={() => setPicking({ kind: 'origin', title: '揀起點' })}
        >
          <span className="plan-dot o" />
          {origin ? <span className="plan-val">{epLabel(origin)}</span> : <span className="plan-ph">揀起點</span>}
        </button>
        <button
          className="plan-field"
          onClick={() => setPicking({ kind: 'dest', title: '揀終點' })}
        >
          <span className="plan-dot d" />
          {dest ? <span className="plan-val">{epLabel(dest)}</span> : <span className="plan-ph">輸入終點 / 喺地圖揀</span>}
        </button>
        <button className="swap" onClick={swap} aria-label="對調起訖">
          ⇅
        </button>

        <div className="preset-chips">
          <button className="preset-chip" onClick={() => setOrigin('mylocation')}>
            📍 我的位置
          </button>
          {PRESET_DEFS.map((d) => (
            <button key={d.id} className="preset-chip" onClick={() => usePreset(d.id)}>
              {d.icon} {presetOf(d.id) ? d.label : `設定${d.label}`}
            </button>
          ))}
        </div>

        <button
          className="primary-btn full"
          disabled={!origin || !dest || planning}
          onClick={doPlan}
        >
          {planning ? '計緊…' : '🧭 搵最快路線'}
        </button>
      </div>

      {planErr && <div className="error pad">⚠️ {planErr}</div>}
      {results && results.length === 0 && !planning && (
        <div className="muted pad">搵唔到合適方案(可試擴大附近範圍或揀近啲車站)。</div>
      )}
      {results && results.length > 0 && (
        <>
          <div className="section-title">{results.length} 個方案 · 估算時間排序</div>
          {results.map((j, i) => (
            <div key={i} className={`jcard ${i === 0 ? 'best' : ''}`}>
              <div className="jhead">
                {i === 0 && <span className="tagbest">最快</span>}
                <span className="jtime">{j.mins}分</span>
                <span className="jmeta">
                  · {j.transfers === 0 ? '直達' : `${j.transfers} 次轉乘`}
                </span>
                {j.fare != null && <span className="jfare">${j.fare.toFixed(1)}</span>}
              </div>
              <div className="legs">{renderLegs(j.legs)}</div>
              {j.fareNote && <div className="muted small" style={{ marginTop: 4 }}>{j.fareNote}</div>}
            </div>
          ))}
          <div className="muted small pad">⚠️ 時間/車費為估算(無時刻表),僅供參考。八達通轉乘優惠未計。</div>
        </>
      )}

      <div className="section-title" style={{ marginTop: 18 }}>喜好地點</div>
      <div className="preset-chips">
        {PRESET_DEFS.map((d) => {
          const sp = presetOf(d.id)
          return (
            <button
              key={d.id}
              className="preset-chip"
              onClick={() =>
                setPicking({ kind: 'preset', presetId: d.id, icon: d.icon, title: `設定:${d.icon} ${d.label}` })
              }
            >
              {d.icon} {d.label}
              {sp ? <span className="muted small"> · 已設</span> : <span className="muted small"> · 未設</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
