import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import type { PickedPlace } from './LocationPicker'

// 地圖揀點(Leaflet)按需載入
const LocationPicker = lazy(() => import('./LocationPicker'))
import { getPosition, describeGeoError } from '../lib/geo'
import { planJourneys, type Journey, type Leg } from '../lib/journey'
import {
  getPlaces,
  savePlace,
  PRESET_DEFS,
  type SavedPlace,
} from '../lib/places'
import { MascotWelcome, MascotState } from './Mascots'
import { leaveAtFor, setReminder, fmtClock } from '../lib/reminder'
import { primeAudio, askNotify } from '../lib/chime'
import { taxiFareEstimate } from '../lib/taxi'
import { addStamp } from '../lib/stamps'
import { useBackLayer } from '../hooks/useBackLayer'

const LEG_COLOR: Record<string, string> = {
  kmb: '#c8102e', ctb: '#0e7490', nlb: '#00857c', gmb: '#167a3a', lightRail: '#7d3c98',
}

/** planner ride leg → 開返路線頁(實時 ETA)用嘅 key */
export interface LegRouteKey {
  co: string
  route: string
  bound: 'I' | 'O'
  serviceType: string
  boardStopId?: string
  dest?: string
}

interface Props {
  onOpenLeg?: (k: LegRouteKey) => void
  /** 外部帶入嘅終點(例如附近 tab「帶我去」) */
  initialDest?: { label: string; lat: number; lng: number } | null
}

function renderLegs(legs: Leg[], onOpenLeg?: (k: LegRouteKey) => void) {
  const items: ReactNode[] = []
  legs.forEach((l, i) => {
    if (i > 0) items.push(<span key={`a${i}`} className="arrow">›</span>)
    if (l.kind === 'walk') {
      items.push(<span key={i} className="leg-walk">🚶{l.mins}分</span>)
    } else {
      const clickable = onOpenLeg && l.co && l.route && l.bound && l.serviceType
      items.push(
        <button
          key={i}
          className={`leg-badge ${clickable ? 'tappable' : ''}`}
          style={{ background: LEG_COLOR[l.co ?? ''] ?? '#666' }}
          disabled={!clickable}
          title={clickable ? '撳一下睇實時到站' : undefined}
          onClick={() =>
            clickable &&
            onOpenLeg!({
              co: l.co!,
              route: l.route!,
              bound: l.bound!,
              serviceType: l.serviceType!,
              boardStopId: l.boardStopId,
              dest: l.dest,
            })
          }
        >
          {l.route}
        </button>,
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

export default function PlannerView({ onOpenLeg, initialDest }: Props) {
  const [origin, setOrigin] = useState<Endpoint>('mylocation')
  const [dest, setDest] = useState<Endpoint>(initialDest ?? null)

  // 外部「帶我去」變咗 → 更新終點
  useEffect(() => {
    if (initialDest) setDest(initialDest)
  }, [initialDest])
  const [picking, setPicking] = useState<Picking>(null)
  const [places, setPlaces] = useState<SavedPlace[]>(getPlaces())
  const [results, setResults] = useState<Journey[] | null>(null)
  const [planning, setPlanning] = useState(false)
  const [planErr, setPlanErr] = useState<string | null>(null)
  const [directOnly, setDirectOnly] = useState(false)
  const [arriveBy, setArriveBy] = useState('') // "HH:MM";空 = 冇設
  const [remindSet, setRemindSet] = useState<number | null>(null) // 已設提醒嘅方案 index
  const [planCoords, setPlanCoords] = useState<{
    o: { lat: number; lng: number }
    d: { lat: number; lng: number }
  } | null>(null) // 的士估價用

  // 揀地點(全屏地圖)撳返回 = 取消,唔好退埋出 app
  useBackLayer(picking !== null, () => setPicking(null))

  const coordsOf = async (e: Endpoint): Promise<{ lat: number; lng: number } | null> => {
    if (e === 'mylocation') {
      const p = await getPosition()
      return { lat: p.coords.latitude, lng: p.coords.longitude }
    }
    if (e) return { lat: e.lat, lng: e.lng }
    return null
  }

  const doPlan = async (dOnly = directOnly) => {
    setPlanning(true)
    setPlanErr(null)
    setResults(null)
    setRemindSet(null)
    try {
      const [oc, dc] = await Promise.all([coordsOf(origin), coordsOf(dest)])
      if (!oc || !dc) throw new Error('請先設定起點同終點')
      const js = await planJourneys(oc, dc, { directOnly: dOnly })
      setResults(js)
      setPlanCoords({ o: oc, d: dc })
      if (js.length) addStamp() // 儲印仔
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
      <Suspense fallback={<MascotState mood="busy" text="地圖載入中…" />}>
        <LocationPicker
          title={picking.title}
          onConfirm={onPick}
          onCancel={() => setPicking(null)}
        />
      </Suspense>
    )
  }

  const swap = () => {
    setOrigin(dest)
    setDest(origin)
  }

  const destLabel = epLabel(dest) || '目的地'

  // 設「夠鐘出門」提醒
  const remindLeave = async (j: Journey, idx: number) => {
    const at = leaveAtFor(arriveBy, j.mins)
    if (at == null) return
    primeAudio()
    await askNotify()
    setReminder({ at, destLabel, journeyMins: j.mins, arriveBy })
    setRemindSet(idx)
  }

  const shown = results && directOnly ? results.filter((j) => j.transfers === 0) : results

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
          <button
            className={`preset-chip ${directOnly ? 'on' : ''}`}
            aria-pressed={directOnly}
            onClick={() => {
              const v = !directOnly
              setDirectOnly(v)
              if (results) void doPlan(v) // 已有結果就即刻重計
            }}
          >
            🚌 只睇直達
          </button>
        </div>

        <div className="arrive-row">
          <label htmlFor="arriveBy">⏰ 幾點前要到?</label>
          <input
            id="arriveBy"
            type="time"
            value={arriveBy}
            onChange={(e) => {
              setArriveBy(e.target.value)
              setRemindSet(null) // 時間變咗,舊提醒指示唔再成立
            }}
          />
          {arriveBy && (
            <button className="fb-x" onClick={() => setArriveBy('')} aria-label="清除時間">
              ✕
            </button>
          )}
        </div>

        <button
          className="primary-btn full"
          disabled={!origin || !dest || planning}
          onClick={() => void doPlan()}
        >
          {planning ? '計緊…' : '🧭 搵最快路線'}
        </button>
      </div>

      {!results && !planning && !planErr && (
        <MascotWelcome title="一齊去邊度玩呢? 💕" sub="揀起點同終點,搵最快路線~ 🥰" />
      )}

      {planErr && <div className="error pad">⚠️ {planErr}</div>}
      {shown && shown.length === 0 && !planning && (
        <MascotState
          mood="sad"
          text={directOnly ? '冇直達方案,試下關「只睇直達」~' : '搵唔到合適方案,試下揀近啲嘅起訖點~'}
        />
      )}
      {shown && shown.length > 0 && (
        <>
          <div className="section-title">
            {shown.length} 個方案 · {directOnly ? '直達優先' : '估算時間排序'}
          </div>
          {shown.map((j, i) => {
            const leaveAt = arriveBy ? leaveAtFor(arriveBy, j.mins) : null
            const missed = leaveAt != null && leaveAt <= Date.now()
            return (
              <div key={i} className={`jcard ${i === 0 ? 'best' : ''}`}>
                <div className="jhead">
                  {i === 0 && <span className="tagbest">💖 最快</span>}
                  <span className="jtime">{j.mins}分</span>
                  <span className="jmeta">
                    · {j.transfers === 0 ? '直達' : `${j.transfers} 次轉乘`}
                  </span>
                  {j.fare != null && <span className="jfare">${j.fare.toFixed(1)}</span>}
                </div>
                <div className="legs">{renderLegs(j.legs, onOpenLeg)}</div>
                {leaveAt != null && (
                  <div className={`leaveby ${missed ? 'missed' : ''}`}>
                    {missed ? (
                      <>⚠️ 想 {arriveBy} 前到就已經過咗最遲出門時間喇</>
                    ) : (
                      <>
                        🏠 最遲 <b>{fmtClock(leaveAt)}</b> 出門
                        {remindSet === i ? (
                          <span className="remind-ok">✓ 已設提醒</span>
                        ) : (
                          <button className="remind-btn" onClick={() => void remindLeave(j, i)}>
                            ⏰ 夠鐘提我
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
                {j.fareNote && <div className="muted small" style={{ marginTop: 4 }}>{j.fareNote}</div>}
              </div>
            )
          })}
          {planCoords && (() => {
            const t = taxiFareEstimate(planCoords.o, planCoords.d)
            return t ? (
              <div className="taxi-row">
                🚕 的士估算 <b>${t.fare}</b>
                <span className="muted small"> · 約 {t.km} 公里 · 市區錶,未計隧道費,僅供參考</span>
              </div>
            ) : null
          })()}
          <div className="muted small pad">
            ⚠️ 時間/車費為估算(無時刻表),僅供參考。八達通轉乘優惠未計。撳路線號可以睇實時到站。
            出門提醒要 app 開住先響。
          </div>
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
