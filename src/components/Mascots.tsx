// 原創 kawaii 公仔(熊貓 🐼 + 啡熊 🐻)—— 自家設計,非任何受版權保護角色。
// 用作 app 識別 / 規劃頁歡迎插圖。

export function PandaFace({ className = 'mascot' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="24" cy="20" rx="13" ry="15" fill="#2e2a2c" />
      <ellipse cx="76" cy="20" rx="13" ry="15" fill="#2e2a2c" />
      <circle cx="50" cy="55" r="38" fill="#fff" stroke="#2e2a2c" strokeWidth="3" />
      <ellipse cx="35" cy="50" rx="10" ry="13" fill="#2e2a2c" />
      <ellipse cx="65" cy="50" rx="10" ry="13" fill="#2e2a2c" />
      <circle cx="37" cy="47" r="3.4" fill="#fff" />
      <circle cx="67" cy="47" r="3.4" fill="#fff" />
      <ellipse cx="24" cy="68" rx="8" ry="6" fill="#ffb3d1" />
      <ellipse cx="76" cy="68" rx="8" ry="6" fill="#ffb3d1" />
      <path d="M43 68 q7 7 14 0" stroke="#2e2a2c" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export function BearFace({ className = 'mascot' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="24" cy="22" rx="14" ry="14" fill="#a9723f" />
      <ellipse cx="76" cy="22" rx="14" ry="14" fill="#a9723f" />
      <circle cx="24" cy="22" r="7" fill="#c89466" />
      <circle cx="76" cy="22" r="7" fill="#c89466" />
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
    </svg>
  )
}

/** 規劃頁 / 空白頁歡迎插圖:一對公仔 + 心心 emoji 裝飾 */
export function MascotWelcome({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="welcome">
      <span className="welcome-float" style={{ top: 30, left: 14 }}>💗</span>
      <span className="welcome-float" style={{ top: 78, left: 70 }}>♡</span>
      <span className="welcome-float" style={{ top: 40, right: 22 }}>💞</span>
      <span className="welcome-float" style={{ top: 104, right: 60 }}>✨</span>
      <span className="welcome-float" style={{ top: 130, left: 36 }}>🌸</span>
      <div className="mascot-pair">
        <PandaFace className="mascot a" />
        <BearFace className="mascot b" />
      </div>
      <div className="welcome-title">{title}</div>
      <div className="welcome-sub">{sub}</div>
      <div className="confetti">♡ ✨ 💗 🎀 💞 ✨ ♡</div>
    </div>
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
      {/* 眼耷耷(向下彎) */}
      <path d="M30 50 q5 4 10 0" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M60 50 q5 4 10 0" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* 眼淚 */}
      <path d="M40 60 q-2 6 0 8 q3 2 4 -2 q0 -4 -4 -6z" fill="#8ecbff" />
      <ellipse cx="24" cy="70" rx="8" ry="6" fill="#ffb3d1" />
      <ellipse cx="76" cy="70" rx="8" ry="6" fill="#ffb3d1" />
      {/* 嘴向下彎 */}
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
