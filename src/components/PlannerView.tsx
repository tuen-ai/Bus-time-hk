import { useState } from 'react'
import LocationPicker, { type PickedPlace } from './LocationPicker'
import {
  getPlaces,
  savePlace,
  PRESET_DEFS,
  type SavedPlace,
} from '../lib/places'

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
  const [planned, setPlanned] = useState(false)

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
          disabled={!origin || !dest}
          onClick={() => setPlanned(true)}
        >
          🧭 搵最快路線
        </button>
      </div>

      {planned && (
        <div className="plan-soon">
          🚧 行程計算演算法<strong>建構中</strong>(直達 + 轉乘 + 車費),好快推出。<br />
          <span className="muted small">
            而家已可設定起訖 + 喜好預設(家/公司);搵路線結果即將上線。
          </span>
        </div>
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
