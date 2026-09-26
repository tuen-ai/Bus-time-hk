// 公仔 + UI 動畫升級預覽片(1080×1920,30fps,27 秒)
import type { CSSProperties, ReactNode } from 'react'
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Bear, KokoBus, Panda } from './characters'

const FONT = '"WenQuanYi Zen Hei", "Noto Sans CJK TC", "PingFang TC", sans-serif'
const C = {
  bg: '#fff0f7',
  card: '#fff',
  text: '#5b3a4d',
  muted: '#7b5b6e',
  line: '#ffd9ec',
  accent: '#c2185b',
  fill: '#e30d6a',
  ok: '#1f7560',
  soon: '#ad4500',
}

// ---- 小工具 ----
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
/** 喺指定格數附近眨眼(每次 4 格) */
function blinkAt(f: number, at: number[]) {
  return at.some((a) => f >= a && f < a + 4) ? 1 : 0
}
/** 揮手:start 至 end 之間手舉高左右擺 */
function wave(f: number, start: number, end: number, side: 'R' | 'L' = 'R') {
  const up = interpolate(f, [start, start + 8, end - 8, end], [0, 1, 1, 0], clamp)
  const swing = Math.sin((f - start) * 0.55) * 22
  const a = up * (-135 + swing)
  return side === 'R' ? a : -a
}
function useSpring(delay: number, damping = 11) {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: f - delay, fps, config: { damping, mass: 0.8 } })
}

function Floaties() {
  const f = useCurrentFrame()
  const items = ['💗', '✨', '🌸', '♡', '💞', '✨', '🎀', '♡']
  return (
    <>
      {items.map((e, i) => {
        const x = (i * 137) % 1000
        const y = 1920 - ((f * (2 + (i % 3)) + i * 260) % 2100)
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x + 20,
              top: y,
              fontSize: 44 + (i % 3) * 14,
              opacity: 0.55,
              transform: `rotate(${Math.sin((f + i * 20) / 18) * 14}deg)`,
            }}
          >
            {e}
          </div>
        )
      })}
    </>
  )
}

function Bg({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <AbsoluteFill
      style={{
        background: dark
          ? 'linear-gradient(180deg, #1a0f17, #3a1830)'
          : 'linear-gradient(180deg, #ffe6f1 0%, #fff0f7 55%, #ffe0ee 100%)',
        fontFamily: FONT,
        color: dark ? '#ffe3f1' : C.text,
        overflow: 'hidden',
      }}
    >
      <Floaties />
      {children}
    </AbsoluteFill>
  )
}

/** 底部字幕:彈入 */
function Caption({ text, delay = 0, sub }: { text: string; delay?: number; sub?: string }) {
  const s = useSpring(delay, 13)
  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        right: 60,
        bottom: 120,
        padding: '28px 36px',
        borderRadius: 36,
        background: 'rgba(255,255,255,.92)',
        boxShadow: '0 10px 40px rgba(244,63,142,.22)',
        textAlign: 'center',
        transform: `translateY(${(1 - s) * 80}px) scale(${0.9 + s * 0.1})`,
        opacity: s,
      }}
    >
      <div style={{ fontSize: 56, fontWeight: 800, color: C.accent }}>{text}</div>
      {sub && <div style={{ fontSize: 34, marginTop: 10, color: C.muted }}>{sub}</div>}
    </div>
  )
}

// ---- 場景 1:開場 ----
function Intro() {
  const f = useCurrentFrame()
  const title = useSpring(4, 9)
  const pIn = useSpring(18)
  const bIn = useSpring(26)
  return (
    <Bg>
      <div
        style={{
          position: 'absolute',
          top: 300,
          width: '100%',
          textAlign: 'center',
          transform: `scale(${title})`,
        }}
      >
        <div style={{ fontSize: 150, fontWeight: 900, color: C.accent, letterSpacing: 8 }}>可可出行</div>
        <div style={{ fontSize: 50, marginTop: 20, color: C.muted }}>公仔 + 動畫升級預覽</div>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 330,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          gap: 40,
        }}
      >
        <Panda
          size={430}
          blink={blinkAt(f, [55])}
          armR={wave(f, 45, 88)}
          ear={Math.sin(f / 5) * 4}
          style={{ transform: `translateY(${(1 - pIn) * 700}px)` }}
        />
        <Bear
          size={430}
          blink={blinkAt(f, [66])}
          armL={wave(f, 50, 88, 'L')}
          ear={Math.sin(f / 6 + 1) * 4}
          style={{ transform: `translateY(${(1 - bIn) * 700}px)` }}
        />
      </div>
    </Bg>
  )
}

// ---- 場景 2:角色升級 ----
function Sparkle({ at, x, y }: { at: number; x: number; y: number }) {
  const f = useCurrentFrame()
  const t = interpolate(f, [at, at + 18], [0, 1], clamp)
  if (t <= 0 || t >= 1) return null
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => {
        const ang = (i / 8) * Math.PI * 2
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x + Math.cos(ang) * t * 160,
              top: y + Math.sin(ang) * t * 160,
              fontSize: 46,
              opacity: 1 - t,
            }}
          >
            {i % 2 ? '✨' : '💗'}
          </div>
        )
      })}
    </>
  )
}

function Characters() {
  const f = useCurrentFrame()
  // 小節:0 眨眼耳仔、45 揮手、90 配件、135 車長帽
  const beat = f < 45 ? 0 : f < 90 ? 1 : f < 135 ? 2 : 3
  const captions = [
    ['👀 識眨眼、耳仔會郁', '唔再係靜止圖'],
    ['👋 見到你會打招呼', '開 App / 門口顯示模式'],
    ['🎀 印仔解鎖配件會「叮」一聲彈出', '蝴蝶結、星星眼…'],
  ]
  const capDrop = interpolate(f, [135, 150], [-420, 0], { ...clamp, easing: Easing.bounce })
  const accessories = f >= 95
  return (
    <Bg>
      <div style={{ position: 'absolute', top: 160, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 64, fontWeight: 900, color: C.accent }}>角色升級</div>
        <div style={{ fontSize: 36, color: C.muted, marginTop: 8 }}>同一對原創熊貓 + 啡熊,加咗身體同表情</div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 470,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          gap: 20,
        }}
      >
        <div style={{ position: 'relative' }}>
          <Panda
            size={500}
            blink={blinkAt(f, [12, 30, 70, 120])}
            ear={beat === 0 ? Math.sin(f / 2.5) * 12 : Math.sin(f / 6) * 3}
            armR={wave(f, 45, 90)}
            bow={accessories}
            starEyes={f >= 110 && f < 132}
            mouth={beat === 1 ? 'open' : 'smile'}
            blush={beat === 2 ? 1 : 0}
          />
          {f >= 135 && (
            <div style={{ position: 'absolute', left: 0, top: capDrop, width: 500 }}>
              <svg viewBox="-10 -10 140 170" width={500} aria-hidden="true">
                <g>
                  <path d="M30 26 Q60 -2 90 26 L92 32 Q60 24 28 32 Z" fill="#ff5fa2" />
                  <path d="M26 31 Q60 22 94 31 Q96 37 88 37 Q60 30 32 37 Q24 37 26 31 Z" fill="#c2185b" />
                  <rect x="51" y="11" width="18" height="11" rx="3" fill="#fff" />
                  <rect x="53.5" y="13" width="5" height="4" rx="1" fill="#ff5fa2" />
                  <rect x="61" y="13" width="5" height="4" rx="1" fill="#ff5fa2" />
                </g>
              </svg>
            </div>
          )}
        </div>
        <Bear
          size={500}
          blink={blinkAt(f, [20, 58, 100, 160])}
          ear={beat === 0 ? Math.sin(f / 2.5 + 1) * 12 : Math.sin(f / 6) * 3}
          armL={beat === 3 ? interpolate(f, [140, 152], [0, 70], clamp) : wave(f, 50, 90, 'L')}
          card={beat === 3}
          mouth={beat === 1 ? 'open' : 'smile'}
        />
      </div>
      <Sparkle at={95} x={620} y={560} />
      <Sparkle at={110} x={300} y={760} />
      <Sequence from={0} durationInFrames={45}>
        <Caption text={captions[0][0]} sub={captions[0][1]} />
      </Sequence>
      <Sequence from={45} durationInFrames={45}>
        <Caption text={captions[1][0]} sub={captions[1][1]} />
      </Sequence>
      <Sequence from={90} durationInFrames={45}>
        <Caption text={captions[2][0]} sub={captions[2][1]} />
      </Sequence>
      <Sequence from={135}>
        <Caption text="🚌 新配件:車長帽 + 可可卡" sub="原創設計,冇任何營辦商 / 品牌標誌" />
      </Sequence>
    </Bg>
  )
}

// ---- 場景 3:App UI 動畫 ----
const phone: CSSProperties = {
  position: 'absolute',
  left: 150,
  top: 150,
  width: 780,
  height: 1330,
  borderRadius: 70,
  background: C.bg,
  border: '16px solid #3a2733',
  overflow: 'hidden',
  boxShadow: '0 30px 80px rgba(120,20,70,.3)',
}

function TopBar() {
  return (
    <div
      style={{
        height: 150,
        background: 'linear-gradient(135deg, #db2777, #be185d)',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '40px 36px 0',
        color: '#fff',
        fontSize: 48,
        fontWeight: 900,
      }}
    >
      <svg viewBox="0 0 100 100" width={72} aria-hidden="true">
        <ellipse cx="24" cy="20" rx="13" ry="15" fill="#2e2a2c" />
        <ellipse cx="76" cy="20" rx="13" ry="15" fill="#2e2a2c" />
        <circle cx="50" cy="55" r="38" fill="#fff" />
        <ellipse cx="35" cy="50" rx="10" ry="13" fill="#2e2a2c" />
        <ellipse cx="65" cy="50" rx="10" ry="13" fill="#2e2a2c" />
        <circle cx="37" cy="47" r="3.4" fill="#fff" />
        <circle cx="67" cy="47" r="3.4" fill="#fff" />
        <path d="M43 68 q7 7 14 0" stroke="#2e2a2c" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
      可可出行
    </div>
  )
}

function Row({
  n,
  name,
  open,
  expand,
  children,
  highlight,
}: {
  n: number
  name: string
  open?: boolean
  expand?: number
  children?: ReactNode
  highlight?: number
}) {
  return (
    <div
      style={{
        borderBottom: `2px solid ${C.line}`,
        background: highlight ? `rgba(255,95,162,${0.12 * highlight})` : 'transparent',
        borderRadius: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '26px 24px', fontSize: 38 }}>
        <div
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            background: open ? C.fill : '#ffe3ef',
            color: open ? '#fff' : C.accent,
            display: 'grid',
            placeItems: 'center',
            fontSize: 30,
            fontWeight: 800,
          }}
        >
          {n}
        </div>
        <div style={{ flex: 1, fontWeight: open ? 800 : 500 }}>{name}</div>
        <div style={{ color: C.muted, transform: `rotate(${(expand ?? 0) * 90}deg)` }}>▸</div>
      </div>
      {open && (
        <div style={{ height: (expand ?? 0) * 300, overflow: 'hidden', padding: '0 24px 0 104px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function AppDemo() {
  const f = useCurrentFrame()
  const typed = f < 15 ? '' : f < 25 ? '3' : '32'
  const cardIn = useSpring(30, 12)
  const press = interpolate(f, [58, 62, 68], [1, 0.95, 1], clamp)
  const slide = interpolate(f, [70, 90], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
  const chip = useSpring(110, 9)
  const expand = interpolate(f, [120, 138], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
  const peek = useSpring(125, 12)
  const mins = f < 170 ? 4 : 3
  const etas = [mins, mins + 7, mins + 15]
  return (
    <Bg>
      <div style={phone}>
        <TopBar />
        {/* 首頁 → 路線頁:左右滑 */}
        <div style={{ position: 'absolute', top: 150, left: 0, right: 0, bottom: 0 }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              padding: 36,
              transform: `translateX(${-slide * 100}%)`,
            }}
          >
            <div
              style={{
                height: 100,
                borderRadius: 50,
                background: '#fff',
                border: `3px solid ${C.line}`,
                display: 'flex',
                alignItems: 'center',
                padding: '0 36px',
                fontSize: 40,
                color: typed ? C.text : C.muted,
              }}
            >
              🔍&nbsp;&nbsp;{typed || '輸入路線號碼'}
              {f % 20 < 10 && f < 40 && <span style={{ color: C.accent }}>|</span>}
            </div>
            <div
              style={{
                marginTop: 36,
                borderRadius: 32,
                background: '#fff',
                boxShadow: '0 6px 24px rgba(244,63,142,.16)',
                padding: 32,
                display: 'flex',
                gap: 26,
                alignItems: 'center',
                opacity: cardIn,
                transform: `translateY(${(1 - cardIn) * 60}px) scale(${press})`,
              }}
            >
              <div
                style={{
                  background: '#e11d48',
                  color: '#fff',
                  fontSize: 44,
                  fontWeight: 900,
                  borderRadius: 18,
                  padding: '10px 22px',
                }}
              >
                32
              </div>
              <div style={{ fontSize: 38 }}>
                往 <b>奧運站</b>
                <div style={{ fontSize: 28, color: C.muted }}>荃灣(石圍角)出發 · 九巴</div>
              </div>
            </div>
          </div>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              padding: 28,
              transform: `translateX(${(1 - slide) * 100}%)`,
            }}
          >
            <div style={{ fontSize: 44, fontWeight: 900, margin: '6px 8px 20px' }}>
              <span style={{ background: '#e11d48', color: '#fff', borderRadius: 14, padding: '4px 16px' }}>
                32
              </span>{' '}
              往奧運站
            </div>
            {/* 最近你 chip:搵緊 → 彈出 */}
            <div style={{ height: 90, margin: '0 8px 14px' }}>
              {f >= 92 && f < 110 && (
                <div style={{ fontSize: 32, color: C.muted, paddingTop: 22 }}>📍 搵緊離你最近嘅站…</div>
              )}
              {f >= 110 && (
                <div
                  style={{
                    display: 'inline-block',
                    padding: '18px 30px',
                    borderRadius: 45,
                    background: '#fff',
                    border: `3px solid ${C.line}`,
                    color: C.accent,
                    fontWeight: 800,
                    fontSize: 34,
                    transform: `scale(${chip})`,
                    transformOrigin: 'left center',
                    boxShadow: `0 0 0 ${interpolate(f, [110, 140], [18, 0], clamp)}px rgba(255,95,162,${interpolate(f, [110, 140], [0.35, 0], clamp)})`,
                  }}
                >
                  📍 最近你:旺角道 · 約 8 米
                </div>
              )}
            </div>
            <div style={{ background: '#fff', borderRadius: 32, padding: '6px 10px' }}>
              <Row n={2} name="長沙灣道" />
              <Row
                n={3}
                name="旺角道"
                open
                expand={expand}
                highlight={interpolate(f, [120, 135, 170], [0, 1, 0.3], clamp)}
              >
                {etas.map((m, i) => {
                  const inT = interpolate(f, [128 + i * 5, 140 + i * 5], [0, 1], clamp)
                  const tick = i === 0 ? interpolate(f, [168, 172, 178], [1, 1.25, 1], clamp) : 1
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 40,
                        fontSize: i === 0 ? 50 : 40,
                        fontWeight: 900,
                        color: C.ok,
                        padding: '12px 0',
                        opacity: inT,
                        transform: `translateX(${(1 - inT) * 40}px)`,
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          transform: `scale(${tick})`,
                          transformOrigin: 'left',
                        }}
                      >
                        {m} 分鐘
                      </span>
                      <span style={{ color: C.muted, fontWeight: 500 }}>
                        12:{String(8 + (m - 4)).padStart(2, '0')}
                      </span>
                    </div>
                  )
                })}
              </Row>
              <Row n={4} name="旺角街市" />
              <Row n={5} name="奧運站巴士總站" />
            </div>
          </div>
        </div>
      </div>
      {/* 熊貓喺電話邊探頭指住 chip */}
      <div
        style={{
          position: 'absolute',
          right: -20,
          top: 330,
          transform: `translateX(${(1 - peek) * 380}px) rotate(-10deg)`,
        }}
      >
        <Panda
          size={330}
          armL={interpolate(f, [130, 142], [0, 115], clamp)}
          blink={blinkAt(f, [160, 190])}
          mouth="open"
        />
      </div>
      <Sequence from={0} durationInFrames={92}>
        <Caption text="✨ 卡片彈入 + 撳落有回饋" sub="頁面左右滑,唔再生硬咁跳" />
      </Sequence>
      <Sequence from={92}>
        <Caption text="📍 自動打開最近你嘅站" sub="「最近你」chip 彈出,站展開 + 班次逐行滑入" />
      </Sequence>
    </Bg>
  )
}

// ---- 場景 4:車就到 ----
function BusArriving() {
  const f = useCurrentFrame()
  const busX = interpolate(f, [10, 70], [1150, 330], { ...clamp, easing: Easing.out(Easing.cubic) })
  const hopT = (a: number) => Math.max(0, Math.sin(((f - a) / 14) * Math.PI)) * (f >= a && f < a + 14 ? 1 : 0)
  const hop = (hopT(40) + hopT(56) + hopT(72)) * 34
  const land = [54, 70, 86].some((a) => f >= a && f < a + 4) ? 0.82 : 1
  const pulse = 1 + Math.sin(f / 4) * 0.05
  const soon = f >= 45
  return (
    <Bg>
      <div style={{ position: 'absolute', top: 200, width: '100%', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-block',
            padding: '26px 60px',
            borderRadius: 80,
            fontSize: 90,
            fontWeight: 900,
            color: '#fff',
            background: soon ? '#ad4500' : C.ok,
            transform: `scale(${soon ? pulse : 1})`,
            boxShadow: soon ? '0 0 0 18px rgba(255,143,67,.25)' : 'none',
          }}
        >
          {soon ? '🚌 即將到站' : '1 分鐘'}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 874,
          left: 0,
          right: 0,
          height: 26,
          background: '#e8c6d6',
          borderRadius: 13,
        }}
      />
      <div style={{ position: 'absolute', top: 620, left: busX }}>
        <KokoBus width={560} wheel={-f * 12} />
      </div>
      <div style={{ position: 'absolute', top: 1000, left: 120 }}>
        <Panda
          size={400}
          hop={hop}
          squash={land}
          mouth={soon ? 'open' : 'smile'}
          armR={soon ? -150 : 0}
          armL={soon ? 150 : 0}
          cap
        />
      </div>
      <div style={{ position: 'absolute', top: 1000, right: 110 }}>
        <Bear
          size={400}
          hop={hopT(48) * 24}
          mouth={soon ? 'open' : 'smile'}
          armL={soon ? 150 : 0}
          armR={soon ? -150 : 0}
          blink={blinkAt(f, [30])}
        />
      </div>
      <Sparkle at={50} x={500} y={1100} />
      <Sparkle at={66} x={300} y={1000} />
      <Sequence from={20}>
        <Caption text="🎉 車就嚟到:公仔跳起提你" sub="≤1 分鐘:「即將到站」脈動 + 公仔歡呼" />
      </Sequence>
    </Bg>
  )
}

// ---- 場景 5:表情 ----
function MoodCard({ title, dark, children }: { title: string; dark?: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        width: 300,
        height: 800,
        borderRadius: 40,
        background: dark ? '#2a1424' : '#fff',
        boxShadow: '0 10px 30px rgba(244,63,142,.18)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 30,
      }}
    >
      {children}
      <div style={{ fontSize: 34, fontWeight: 800, color: dark ? '#ffe3f1' : C.accent, marginTop: 10 }}>
        {title}
      </div>
    </div>
  )
}

function Moods() {
  const f = useCurrentFrame()
  const sIn = (d: number) => spring({ frame: f - d, fps: 30, config: { damping: 12 } })
  return (
    <Bg>
      <div style={{ position: 'absolute', top: 150, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 64, fontWeight: 900, color: C.accent }}>天氣 / 夜晚表情</div>
        <div style={{ fontSize: 36, color: C.muted, marginTop: 8 }}>首頁 + 門口顯示模式都會跟住變</div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 400,
          left: 40,
          right: 40,
          display: 'flex',
          gap: 30,
          justifyContent: 'center',
        }}
      >
        <div style={{ transform: `scale(${sIn(0)})` }}>
          <MoodCard title="☔ 落雨:撐遮">
            {Array.from({ length: 14 }, (_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: (i * 71) % 290,
                  top: ((f * 14 + i * 97) % 700) - 60,
                  width: 4,
                  height: 36,
                  borderRadius: 2,
                  background: '#8ecbff',
                  transform: 'rotate(12deg)',
                }}
              />
            ))}
            <Panda
              size={290}
              umbrella
              blink={blinkAt(f, [25, 70])}
              ear={Math.sin(f / 5) * 3}
              style={{ position: 'relative' }}
            />
          </MoodCard>
        </div>
        <div style={{ transform: `scale(${sIn(8)})` }}>
          <MoodCard title="🥵 好熱:流汗">
            <div
              style={{
                position: 'absolute',
                top: 30,
                right: 30,
                fontSize: 80,
                transform: `rotate(${f * 2}deg)`,
              }}
            >
              ☀️
            </div>
            <Bear
              size={290}
              sweat
              blink={blinkAt(f, [40])}
              mouth="open"
              squash={1 + Math.sin(f / 3) * 0.02}
            />
          </MoodCard>
        </div>
        <div style={{ transform: `scale(${sIn(16)})` }}>
          <MoodCard title="🌙 夜晚:眼瞓" dark>
            <div style={{ position: 'absolute', top: 40, left: 40, fontSize: 70 }}>🌙</div>
            {[0, 1, 2].map((i) => {
              const t = ((f + i * 20) % 60) / 60
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: 190 + t * 60,
                    top: 230 - t * 140,
                    fontSize: 40 + i * 10,
                    fontWeight: 900,
                    color: '#ffb3d1',
                    opacity: 1 - t,
                  }}
                >
                  Z
                </div>
              )
            })}
            <Panda size={290} mouth="sleep" squash={1 + Math.sin(f / 10) * 0.025} />
          </MoodCard>
        </div>
      </div>
      <Caption text="表情跟天文台天氣自動轉" sub="夜晚 7 點後門口顯示模式轉眼瞓版" />
    </Bg>
  )
}

// ---- 場景 6:收尾 ----
function Outro() {
  const f = useCurrentFrame()
  const s = useSpring(0, 10)
  return (
    <Bg>
      <div
        style={{
          position: 'absolute',
          top: 360,
          width: '100%',
          textAlign: 'center',
          transform: `scale(${s})`,
        }}
      >
        <div style={{ fontSize: 110, fontWeight: 900, color: C.accent }}>預覽完 ✨</div>
        <div style={{ fontSize: 46, marginTop: 24, color: C.muted }}>鍾意邊啲,話我知就放入 App</div>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 300,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          gap: 30,
        }}
      >
        <Panda size={420} armR={wave(f, 5, 80)} blink={blinkAt(f, [30])} cap bow />
        <Bear size={420} armL={wave(f, 10, 80, 'L')} blink={blinkAt(f, [45])} card />
      </div>
    </Bg>
  )
}

export const SCENES = [
  { C: Intro, len: 90 },
  { C: Characters, len: 180 },
  { C: AppDemo, len: 210 },
  { C: BusArriving, len: 120 },
  { C: Moods, len: 120 },
  { C: Outro, len: 90 },
]
export const TOTAL = SCENES.reduce((a, s) => a + s.len, 0)

/** 場景之間用 8 格淡入 */
function Fade({ children, len }: { children: ReactNode; len: number }) {
  const f = useCurrentFrame()
  const o = interpolate(f, [0, 8, len - 6, len], [0, 1, 1, 0.6], clamp)
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>
}

export function KokoPreview() {
  let from = 0
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {SCENES.map(({ C: Scene, len }, i) => {
        const at = from
        from += len
        return (
          <Sequence key={i} from={at} durationInFrames={len}>
            <Fade len={len}>
              <Scene />
            </Fade>
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
