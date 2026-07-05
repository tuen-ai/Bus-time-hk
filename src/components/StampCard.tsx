// 熊貓集印卡:顯示總印數、最近 7 日、下一個里程碑進度 + 已解鎖造型。
import { getStamps, unlocked, nextMilestone, MILESTONES } from '../lib/stamps'

export default function StampCard() {
  const s = getStamps()
  if (s.total === 0) return null // 未有印仔就唔阻位
  const un = unlocked(s)
  const next = nextMilestone(s)

  // 最近 7 日邊日有印
  const days: { label: string; got: boolean }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push({ label: '日一二三四五六'[d.getDay()], got: s.days.includes(key) })
  }

  return (
    <div className="stamp-card">
      <div className="stamp-head">
        <span>🐼 集印卡 · {s.total} 個印</span>
        {next && (
          <span className="muted small">
            仲差 {next.at - s.total} 個 → {next.emoji} {next.label}
          </span>
        )}
      </div>
      <div className="stamp-week">
        {days.map((d, i) => (
          <span key={i} className={`stamp-dot ${d.got ? 'got' : ''}`}>
            <i>{d.label}</i>
            {d.got ? '🐾' : '·'}
          </span>
        ))}
      </div>
      {un.length > 0 && (
        <div className="stamp-unlocks muted small">
          已解鎖:{MILESTONES.filter((m) => un.includes(m.id)).map((m) => `${m.emoji}${m.label}`).join(' · ')}
        </div>
      )}
      {next && (
        <div className="stamp-bar">
          <i style={{ width: `${Math.min(100, (s.total / next.at) * 100)}%` }} />
        </div>
      )}
    </div>
  )
}
