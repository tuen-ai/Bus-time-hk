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
        <span>
          <span aria-hidden="true">🐼</span> 集印卡 · {s.total} 個印
        </span>
        {next && (
          <span className="muted small">
            仲差 {next.at - s.total} 個 → {next.emoji} {next.label}
          </span>
        )}
      </div>
      <div className="stamp-week">
        {days.map((d, i) => (
          // 讀屏讀「星期一 有印」,唔好讀「一 paw prints」
          <span
            key={i}
            className={`stamp-dot ${d.got ? 'got' : ''}`}
            role="img"
            aria-label={`星期${d.label} ${d.got ? '有印' : '冇印'}`}
          >
            <i>{d.label}</i>
            {d.got ? '🐾' : '·'}
          </span>
        ))}
      </div>
      {un.length > 0 && (
        <div className="stamp-unlocks muted small">
          已解鎖:
          {MILESTONES.filter((m) => un.includes(m.id))
            .map((m) => `${m.emoji}${m.label}`)
            .join(' · ')}
        </div>
      )}
      {next && (
        <div
          className="stamp-bar"
          role="progressbar"
          aria-label={`${next.label}進度`}
          aria-valuemin={0}
          aria-valuemax={next.at}
          aria-valuenow={Math.min(s.total, next.at)}
          aria-valuetext={`${s.total} / ${next.at} 個印`}
        >
          <i style={{ width: `${Math.min(100, (s.total / next.at) * 100)}%` }} />
        </div>
      )}
    </div>
  )
}
