// 可可出行原創公仔(熊貓 + 啡熊)升級版:加身體、眨眼、耳仔郁、揮手、跳、天氣 / 夜晚表情。
// 樣貌沿用 app 入面 src/components/Mascots.tsx 嘅原創臉(非任何受版權保護角色)。
// 全部參數都係數值,Remotion 逐格計(之後放入 app 會改用 CSS 動畫做同一套動作)。
import type { CSSProperties } from 'react'

const INK = '#2e2a2c'
const PINK = '#ff5fa2'
const BLUSH = '#ffb3d1'

export interface Pose {
  /** 0 = 開眼,1 = 閂眼 */
  blink?: number
  /** 耳仔擺動角度(度) */
  ear?: number
  /** 右手(畫面右邊)舉起角度:0 = 垂低,-150 = 舉高揮手 */
  armR?: number
  /** 左手(畫面左邊)舉起角度:0 = 垂低,150 = 舉高 */
  armL?: number
  /** 跳起高度(px,viewBox 單位) */
  hop?: number
  /** 壓扁 / 拉長:1 = 正常,<1 扁,>1 長 */
  squash?: number
  mouth?: 'smile' | 'open' | 'sleep'
  cap?: boolean
  bow?: boolean
  starEyes?: boolean
  umbrella?: boolean
  sweat?: boolean
  /** 0–1:面珠紅暈加深 */
  blush?: number
  style?: CSSProperties
  size?: number
}

/** 身體跳 / 壓扁:以腳底做原點 */
function bodyTransform(hop = 0, squash = 1) {
  const sx = 1 + (1 - squash) * 0.6
  return `translate(60 ${150 - hop}) scale(${sx} ${squash}) translate(-60 -150)`
}

function CaptainCap() {
  // 原創粉紅車長帽 + 細巴士徽章
  return (
    <g>
      <path d="M30 26 Q60 -2 90 26 L92 32 Q60 24 28 32 Z" fill={PINK} />
      <path d="M26 31 Q60 22 94 31 Q96 37 88 37 Q60 30 32 37 Q24 37 26 31 Z" fill="#c2185b" />
      <rect x="51" y="11" width="18" height="11" rx="3" fill="#fff" />
      <rect x="53.5" y="13" width="5" height="4" rx="1" fill={PINK} />
      <rect x="61" y="13" width="5" height="4" rx="1" fill={PINK} />
      <circle cx="55" cy="22.5" r="1.8" fill={INK} />
      <circle cx="65" cy="22.5" r="1.8" fill={INK} />
    </g>
  )
}

function Star({ x, y }: { x: number; y: number }) {
  return (
    <path
      transform={`translate(${x} ${y})`}
      d="M0 -6 l1.8 3.8 4.1.5 -3.1 2.8 1 4 -3.8-2.1 -3.8 2.1 1-4 -3.1-2.8 4.1-.5z"
      fill="#ffe27a"
    />
  )
}

export function Panda(p: Pose) {
  const { blink = 0, ear = 0, armR = 0, armL = 0, hop = 0, squash = 1, mouth = 'smile', blush = 0 } = p
  const closed = blink > 0.5
  return (
    <svg viewBox="-10 -10 140 170" width={p.size ?? 300} style={p.style} aria-hidden="true">
      {/* 地面影:跳得高就細啲淡啲 */}
      <ellipse cx="60" cy="152" rx={30 - hop * 0.25} ry="5" fill="rgba(0,0,0,.12)" />
      <g transform={bodyTransform(hop, squash)}>
        {p.umbrella && (
          <g transform="translate(0 -8)">
            <path
              d="M60 -6 q-40 0 -46 26 q10 -8 23 0 q11 -9 23 0 q11 -9 23 0 q12 -8 23 0 Q100 -6 60 -6z"
              fill="#ff8fc0"
              stroke="#f43f8e"
              strokeWidth="1.8"
            />
            <path d="M60 -4 v14" stroke="#f43f8e" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}
        {/* 腳 */}
        <ellipse cx="46" cy="143" rx="11" ry="8" fill={INK} />
        <ellipse cx="74" cy="143" rx="11" ry="8" fill={INK} />
        {/* 身 */}
        <ellipse cx="60" cy="116" rx="30" ry="28" fill="#fff" stroke={INK} strokeWidth="3" />
        <ellipse cx="60" cy="121" rx="15" ry="13" fill="#fff4f8" />
        {/* 手:以膊頭做軸心轉 */}
        <g transform={`rotate(${armL} 35 102)`}>
          <ellipse cx="29" cy="116" rx="9" ry="15" transform="rotate(20 29 116)" fill={INK} />
        </g>
        <g transform={`rotate(${armR} 85 102)`}>
          <ellipse cx="91" cy="116" rx="9" ry="15" transform="rotate(-20 91 116)" fill={INK} />
        </g>
        {/* 頭 */}
        <g transform="translate(10 0)">
          <ellipse cx="24" cy="20" rx="13" ry="15" fill={INK} transform={`rotate(${-ear} 24 26)`} />
          <ellipse cx="76" cy="20" rx="13" ry="15" fill={INK} transform={`rotate(${ear} 76 26)`} />
          <circle cx="50" cy="55" r="38" fill="#fff" stroke={INK} strokeWidth="3" />
          <ellipse cx="35" cy="50" rx="10" ry="13" fill={INK} />
          <ellipse cx="65" cy="50" rx="10" ry="13" fill={INK} />
          {closed || mouth === 'sleep' ? (
            <>
              <path d="M30 49 q5 4 10 0" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M60 49 q5 4 10 0" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
            </>
          ) : p.starEyes ? (
            <>
              <Star x={35} y={48} />
              <Star x={65} y={48} />
            </>
          ) : (
            <>
              <circle cx="37" cy="47" r="3.6" fill="#fff" />
              <circle cx="67" cy="47" r="3.6" fill="#fff" />
              <circle cx="33.5" cy="53" r="1.4" fill="#fff" opacity=".8" />
              <circle cx="63.5" cy="53" r="1.4" fill="#fff" opacity=".8" />
            </>
          )}
          {p.sweat && <path d="M78 36 q-3.5 7 0 9.5 q4 2.2 5 -2.2 q.5 -4 -5 -7.3z" fill="#8ecbff" />}
          <ellipse cx="24" cy="68" rx="8" ry="6" fill={BLUSH} opacity={0.75 + blush * 0.25} />
          <ellipse cx="76" cy="68" rx="8" ry="6" fill={BLUSH} opacity={0.75 + blush * 0.25} />
          {mouth === 'open' ? (
            <path
              d="M43 66 q7 12 14 0 z"
              fill="#e04f7a"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          ) : mouth === 'sleep' ? (
            <ellipse cx="50" cy="70" rx="3" ry="3.6" fill="none" stroke={INK} strokeWidth="2.4" />
          ) : (
            <path d="M43 68 q7 7 14 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
          )}
          {p.bow && (
            <g>
              <path d="M66 10 l11 -6 v12 z" fill={PINK} />
              <path d="M78 10 l11 6 v-12 z" fill={PINK} />
              <circle cx="77.5" cy="10" r="3.4" fill="#ff8fc0" />
            </g>
          )}
        </g>
        {p.cap && <CaptainCap />}
      </g>
    </svg>
  )
}

export function Bear(p: Pose & { card?: boolean }) {
  const { blink = 0, ear = 0, armR = 0, armL = 0, hop = 0, squash = 1, mouth = 'smile', blush = 0 } = p
  const eyeScale = 1 - Math.min(1, blink) * 0.85
  return (
    <svg viewBox="-10 -10 140 170" width={p.size ?? 300} style={p.style} aria-hidden="true">
      <ellipse cx="60" cy="152" rx={30 - hop * 0.25} ry="5" fill="rgba(0,0,0,.12)" />
      <g transform={bodyTransform(hop, squash)}>
        <ellipse cx="46" cy="143" rx="11" ry="8" fill="#8f5d31" />
        <ellipse cx="74" cy="143" rx="11" ry="8" fill="#8f5d31" />
        <ellipse cx="60" cy="116" rx="30" ry="28" fill="#c89466" />
        <ellipse cx="60" cy="121" rx="17" ry="15" fill="#f0d8bd" />
        <g transform={`rotate(${armL} 35 102)`}>
          <ellipse cx="29" cy="116" rx="9" ry="15" transform="rotate(20 29 116)" fill="#a9723f" />
          {p.card && (
            <g transform="rotate(-12 24 128)">
              <rect
                x="12"
                y="122"
                width="22"
                height="14"
                rx="3"
                fill="#ff8fc0"
                stroke="#fff"
                strokeWidth="1.5"
              />
              <path d="M20 127 q2 -2.5 3 0 q1 -2.5 3 0 q0 2 -3 4 q-3 -2 -3 -4z" fill="#fff" />
            </g>
          )}
        </g>
        <g transform={`rotate(${armR} 85 102)`}>
          <ellipse cx="91" cy="116" rx="9" ry="15" transform="rotate(-20 91 116)" fill="#a9723f" />
        </g>
        <g transform="translate(10 0)">
          <g transform={`rotate(${-ear} 24 26)`}>
            <ellipse cx="24" cy="22" rx="14" ry="14" fill="#a9723f" />
            <circle cx="24" cy="22" r="7" fill="#c89466" />
          </g>
          <g transform={`rotate(${ear} 76 26)`}>
            <ellipse cx="76" cy="22" rx="14" ry="14" fill="#a9723f" />
            <circle cx="76" cy="22" r="7" fill="#c89466" />
          </g>
          <circle cx="50" cy="55" r="38" fill="#c89466" />
          <ellipse cx="50" cy="64" rx="20" ry="16" fill="#f0d8bd" />
          {mouth === 'sleep' ? (
            <>
              <path d="M31 48 q5 4 10 0" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
              <path d="M59 48 q5 4 10 0" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <ellipse cx="36" cy="48" rx="5" ry={5 * eyeScale} fill={INK} />
              <ellipse cx="64" cy="48" rx="5" ry={5 * eyeScale} fill={INK} />
              {eyeScale > 0.5 && (
                <>
                  <circle cx="37.5" cy="46.5" r="1.6" fill="#fff" />
                  <circle cx="65.5" cy="46.5" r="1.6" fill="#fff" />
                </>
              )}
            </>
          )}
          <ellipse cx="50" cy="58" rx="5" ry="3.5" fill={INK} />
          {mouth === 'open' ? (
            <path
              d="M44 63 q6 10 12 0 z"
              fill="#e04f7a"
              stroke={INK}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
          ) : (
            <path d="M44 64 q6 5 12 0" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          )}
          <ellipse cx="28" cy="60" rx="6.5" ry="4.5" fill="#ff9ec4" opacity={0.8 + blush * 0.2} />
          <ellipse cx="72" cy="60" rx="6.5" ry="4.5" fill="#ff9ec4" opacity={0.8 + blush * 0.2} />
          {p.sweat && <path d="M80 34 q-3.5 7 0 9.5 q4 2.2 5 -2.2 q.5 -4 -5 -7.3z" fill="#8ecbff" />}
        </g>
        {p.cap && <CaptainCap />}
      </g>
    </svg>
  )
}

/** 原創粉紅小巴士(冇任何營辦商標誌) */
export function KokoBus({ width = 420, wheel = 0 }: { width?: number; wheel?: number }) {
  return (
    <svg viewBox="0 0 220 110" width={width} aria-hidden="true">
      <rect x="6" y="10" width="206" height="78" rx="18" fill="#ff7eb3" />
      <rect x="6" y="62" width="206" height="10" fill="#fff" opacity=".85" />
      {[22, 62, 102, 142].map((x) => (
        <rect key={x} x={x} y="22" width="32" height="28" rx="6" fill="#dff3ff" />
      ))}
      <rect x="180" y="22" width="24" height="44" rx="6" fill="#dff3ff" />
      <text x="96" y="84" textAnchor="middle" fontSize="13" fontWeight="800" fill="#c2185b">
        可可出行
      </text>
      <circle cx="204" cy="78" r="4" fill="#ffe27a" />
      {[50, 170].map((cx) => (
        <g key={cx} transform={`rotate(${wheel} ${cx} 92)`}>
          <circle cx={cx} cy="92" r="15" fill={INK} />
          <circle cx={cx} cy="92" r="6" fill="#ddd" />
          <rect x={cx - 1.5} y="79" width="3" height="8" fill="#ddd" />
        </g>
      ))}
    </svg>
  )
}
