// 原創 kawaii 公仔(熊貓 🐼 + 啡熊 🐻)—— 自家設計,非任何受版權保護角色。
// 支援配件(蝴蝶結/星星眼/太空騎士/獎牌 —— 儲印仔解鎖)同天氣反應(遮/汗)。
import { useEffect, useState } from 'react'
import { getWeather, type Weather } from '../api/weather'
import { getStamps, unlocked } from '../lib/stamps'

interface PandaProps {
  className?: string
  bow?: boolean // 🎀 3 日解鎖
  starEyes?: boolean // ✨ 7 日解鎖
  umbrella?: boolean // ☔ 落雨自動
  sweat?: boolean // 🥵 酷熱自動
}

export function PandaFace({ className = 'mascot', bow, starEyes, umbrella, sweat }: PandaProps) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      {umbrella && (
        <g>
          <path d="M50 2 q-30 0 -34 22 q8 -7 17 0 q8 -8 17 0 q8 -8 17 0 q9 -7 17 0 Q80 2 50 2z" fill="#ff8fc0" stroke="#f43f8e" strokeWidth="1.5" />
          <path d="M50 4 v10" stroke="#f43f8e" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}
      <ellipse cx="24" cy="20" rx="13" ry="15" fill="#2e2a2c" />
      <ellipse cx="76" cy="20" rx="13" ry="15" fill="#2e2a2c" />
      <circle cx="50" cy="55" r="38" fill="#fff" stroke="#2e2a2c" strokeWidth="3" />
      <ellipse cx="35" cy="50" rx="10" ry="13" fill="#2e2a2c" />
      <ellipse cx="65" cy="50" rx="10" ry="13" fill="#2e2a2c" />
      {starEyes ? (
        <>
          <path d="M35 44 l1.6 3.4 3.7.4 -2.8 2.5 .9 3.6 -3.4-1.9 -3.4 1.9 .9-3.6 -2.8-2.5 3.7-.4z" fill="#ffe27a" />
          <path d="M65 44 l1.6 3.4 3.7.4 -2.8 2.5 .9 3.6 -3.4-1.9 -3.4 1.9 .9-3.6 -2.8-2.5 3.7-.4z" fill="#ffe27a" />
        </>
      ) : (
        <>
          <circle cx="37" cy="47" r="3.4" fill="#fff" />
          <circle cx="67" cy="47" r="3.4" fill="#fff" />
        </>
      )}
      {sweat && <path d="M76 38 q-3 6 0 8 q3.5 2 4.5 -2 q0.5 -3.5 -4.5 -6z" fill="#8ecbff" />}
      <ellipse cx="24" cy="68" rx="8" ry="6" fill="#ffb3d1" />
      <ellipse cx="76" cy="68" rx="8" ry="6" fill="#ffb3d1" />
      <path d="M43 68 q7 7 14 0" stroke="#2e2a2c" strokeWidth="3" fill="none" strokeLinecap="round" />
      {bow && (
        <g>
          <path d="M66 10 l11 -6 v12 z" fill="#ff5fa2" />
          <path d="M78 10 l11 6 v-12 z" fill="#ff5fa2" />
          <circle cx="77.5" cy="10" r="3.4" fill="#ff8fc0" />
        </g>
      )}
    </svg>
  )
}

interface BearProps {
  className?: string
  knight?: boolean // ⚔️ 14 日解鎖(原創太空騎士,非任何電影角色)
  medal?: boolean // 🏅 30 日解鎖
}

export function BearFace({ className = 'mascot', knight, medal }: BearProps) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="24" cy="22" rx="14" ry="14" fill="#a9723f" />
      <ellipse cx="76" cy="22" rx="14" ry="14" fill="#a9723f" />
      <circle cx="24" cy="22" r="7" fill="#c89466" />
      <circle cx="76" cy="22" r="7" fill="#c89466" />
      {knight && (
        <path d="M14 40 Q10 8 50 8 Q90 8 86 40 q-6 -14 -36 -14 q-30 0 -36 14z" fill="#5b4a36" />
      )}
      <circle cx="50" cy="55" r="38" fill="#c89466" />
      <ellipse cx="50" cy="64" rx="20" ry="16" fill="#f0d8bd" />
      <circle cx="36" cy="48" r="5" fill="#2e2a2c" />
      <circle cx="64" cy="48" r="5" fill="#2e2a2c" />
      <circle cx="37.5" cy="46.5" r="1.6" fill="#fff" />
      <circle cx="65.5" cy="46.5" r="1.6" fill="#fff" />
      <ellipse cx="50" cy="58" rx="5" ry="3.5" fill="#2e2a2c" />
      <path d="M44 64 q6 5 12 0" stroke="#2e2a2c" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <ellipse cx="28" cy="60" rx="6.5" ry="4.5" fill="#ff9ec4" />
      <ellipse cx="72" cy="60" rx="6.5" ry="4.5" fill="#ff9ec4" />
      {knight && (
        <g>
          <rect x="88" y="52" width="4" height="9" rx="1.5" fill="#777" />
          <rect x="88.6" y="20" width="2.8" height="33" rx="1.4" fill="#5fd0ff" />
          <rect x="89.2" y="20" width="1.6" height="33" rx=".8" fill="#eaffff" />
        </g>
      )}
      {medal && (
        <g>
          <path d="M46 84 l4 8 4 -8z" fill="#ff5fa2" />
          <circle cx="50" cy="93" r="6" fill="#ffd34d" stroke="#e0a800" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  )
}

/** 細版單一公仔(topbar logo) */
export function PandaLogo({ className = 'topbar-logo' }: { className?: string }) {
  return <PandaFace className={className} />
}

/** Sad 熊貓(眼耷耷 + 眼淚)—— 搵唔到嘢/出錯時用 */
export function PandaSad({ className = 'mascot sm' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="24" cy="22" rx="13" ry="14" fill="#2e2a2c" />
      <ellipse cx="76" cy="22" rx="13" ry="14" fill="#2e2a2c" />
      <circle cx="50" cy="56" r="38" fill="#fff" stroke="#2e2a2c" strokeWidth="3" />
      <ellipse cx="35" cy="52" rx="10" ry="12" fill="#2e2a2c" />
      <ellipse cx="65" cy="52" rx="10" ry="12" fill="#2e2a2c" />
      <path d="M30 50 q5 4 10 0" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M60 50 q5 4 10 0" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M40 60 q-2 6 0 8 q3 2 4 -2 q0 -4 -4 -6z" fill="#8ecbff" />
      <ellipse cx="24" cy="70" rx="8" ry="6" fill="#ffb3d1" />
      <ellipse cx="76" cy="70" rx="8" ry="6" fill="#ffb3d1" />
      <path d="M43 74 q7 -6 14 0" stroke="#2e2a2c" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/** 狀態小插圖:busy(郁動熊貓)/ sad(喊喊熊貓)+ 一句話 */
export function MascotState({ mood, text }: { mood: 'busy' | 'sad'; text: string }) {
  return (
    <div className="mascot-state" role="status">
      {mood === 'sad' ? <PandaSad /> : <PandaFace className="mascot sm a" />}
      <div className="mascot-state-text">{text}</div>
    </div>
  )
}

// 天氣 → 公仔反應 + 一句貼心話
function weatherMood(w: Weather | null): { umbrella: boolean; sweat: boolean; line: string | null } {
  if (!w) return { umbrella: false, sweat: false, line: null }
  const codes = w.warnings.map((x) => x.code)
  if (codes.some((c) => c.startsWith('TC'))) {
    return { umbrella: true, sweat: false, line: '🌀 打緊風呀,出門前睇定班次同停駛消息~' }
  }
  if (codes.some((c) => c.startsWith('WRAIN')) || Object.values(w.rainfall).some((mm) => mm >= 5)) {
    return { umbrella: true, sweat: false, line: '☔ 落緊雨,記得帶遮呀~' }
  }
  if (w.tempC != null && w.tempC >= 33) {
    return { umbrella: false, sweat: true, line: '🥵 今日好熱,搭有冷氣嘅車涼下啦~' }
  }
  return { umbrella: false, sweat: false, line: null }
}

/** 規劃頁 / 空白頁歡迎插圖:一對公仔(印仔解鎖造型 + 天氣反應)+ 心心裝飾 */
export function MascotWelcome({ title, sub }: { title: string; sub: string }) {
  const [wx, setWx] = useState<Weather | null>(null)
  useEffect(() => {
    getWeather().then(setWx).catch(() => {})
  }, [])
  const un = unlocked(getStamps())
  const mood = weatherMood(wx)
  return (
    <div className="welcome">
      <span className="welcome-float" style={{ top: 30, left: 14 }}>💗</span>
      <span className="welcome-float" style={{ top: 78, left: 70 }}>♡</span>
      <span className="welcome-float" style={{ top: 40, right: 22 }}>💞</span>
      <span className="welcome-float" style={{ top: 104, right: 60 }}>✨</span>
      <span className="welcome-float" style={{ top: 130, left: 36 }}>🌸</span>
      <div className="mascot-pair">
        <PandaFace
          className="mascot a"
          bow={un.includes('bow')}
          starEyes={un.includes('star')}
          umbrella={mood.umbrella}
          sweat={mood.sweat}
        />
        <BearFace className="mascot b" knight={un.includes('knight')} medal={un.includes('gold')} />
      </div>
      <div className="welcome-title">{title}</div>
      <div className="welcome-sub">{sub}</div>
      {mood.line && <div className="wx-mood">{mood.line}</div>}
      <div className="confetti">♡ ✨ 💗 🎀 💞 ✨ ♡</div>
    </div>
  )
}
