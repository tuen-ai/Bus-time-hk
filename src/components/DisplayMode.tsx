// 📺 門口顯示模式(iPad 橫擺 kiosk):
// 大時鐘 + 是日勵志名句 + 天氣 + 收藏路線大字 ETA(10 秒刷新)+ 新聞輪播 + 雙公仔。
// 19:00–07:00 自動轉深色;wake lock 防瞓;畫面鎖定 —— 長按 3 秒先退出,誤觸只會彈提示。
import { useCallback, useEffect, useRef, useState } from 'react'
import { getEta, coClass, type Route } from '../api/bus'
import { getFavorites, type Favorite } from '../lib/store'
import { getWeather, type Weather } from '../api/weather'
import { quoteForDisplay } from '../data/quotes'
import { minutesUntil } from '../lib/time'
import { PandaFace, BearFace } from './Mascots'
import { getStamps, unlocked } from '../lib/stamps'

const ETA_MS = 10_000
const NEWS_ROTATE_MS = 12_000
const MAX_ROWS = 5

const favToRoute = (f: Favorite): Route => ({
  co: f.co,
  route: f.route,
  bound: f.bound,
  service_type: f.serviceType,
  orig_tc: '',
  dest_tc: f.dest,
})

interface RowEta {
  mins: number[]
}

const isNight = (d: Date) => d.getHours() >= 19 || d.getHours() < 7

const weatherLine = (w: Weather | null): string | null => {
  if (!w) return null
  const codes = w.warnings.map((x) => x.code)
  if (codes.some((c) => c.startsWith('TC'))) return '打緊風,留意班次安排 🌀'
  if (codes.some((c) => c.startsWith('WRAIN')) || Object.values(w.rainfall).some((mm) => mm >= 5))
    return '落緊雨帶遮呀 ☔'
  if (w.tempC != null && w.tempC >= 33) return '好熱呀,注意補水 🥵'
  if (w.tempC != null && w.tempC <= 12) return '凍呀,着多件衫 🧣'
  return null
}

export default function DisplayMode({ onExit }: { onExit: () => void }) {
  const [now, setNow] = useState(new Date())
  const [favs] = useState<Favorite[]>(() => getFavorites().slice(0, MAX_ROWS))
  const [etas, setEtas] = useState<Record<string, RowEta>>({})
  const [wx, setWx] = useState<Weather | null>(null)
  const [news, setNews] = useState<string[]>([])
  const [newsIdx, setNewsIdx] = useState(0)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const wakeRef = useRef<{ release?: () => Promise<void> } | null>(null)

  // 時鐘每秒行
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // ETA 每 10 秒刷新
  const loadEtas = useCallback(async () => {
    const out: Record<string, RowEta> = {}
    await Promise.all(
      favs.map(async (f) => {
        try {
          const list = await getEta(favToRoute(f), f.stopId)
          const t = Date.now()
          const mins = list
            .map((e) => (e.eta ? minutesUntil(e.eta, t) : null))
            .filter((m): m is number => m != null)
            .sort((a, b) => a - b)
            .slice(0, 3)
          out[`${f.co}|${f.route}|${f.bound}|${f.stopId}`] = { mins }
        } catch {
          /* 呢條線今次攞唔到,下一輪再試 */
        }
      }),
    )
    setEtas((prev) => ({ ...prev, ...out }))
    setUpdatedAt(new Date())
  }, [favs])

  useEffect(() => {
    void loadEtas()
    const id = setInterval(() => void loadEtas(), ETA_MS)
    return () => clearInterval(id)
  }, [loadEtas])

  // 天氣(5 分鐘 cache 喺 api 層)+ 新聞
  useEffect(() => {
    const load = () => {
      getWeather().then(setWx).catch(() => {})
      fetch('./news.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { items?: string[] } | null) => {
          if (j?.items?.length) setNews(j.items)
        })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // 新聞每 12 秒轉一條
  useEffect(() => {
    if (news.length < 2) return
    const id = setInterval(() => setNewsIdx((i) => (i + 1) % news.length), NEWS_ROTATE_MS)
    return () => clearInterval(id)
  }, [news])

  // Wake lock 防瞓(iPad Safari 16.4+;失效時靠 iPad 設定自動鎖定=永不)
  useEffect(() => {
    const acquire = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> }
        }
        if (nav.wakeLock) wakeRef.current = await nav.wakeLock.request('screen')
      } catch {
        /* 唔支援就算 */
      }
    }
    void acquire()
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      void wakeRef.current?.release?.()
    }
  }, [])

  // 🔒 鎖定:撳一下唔會退出(顯示提示),長按 3 秒先退出 —— 防小朋友/誤觸
  const [lockHint, setLockHint] = useState(false)
  const holdRef = useRef<number | null>(null)
  const heldRef = useRef(false)
  const holdStart = () => {
    heldRef.current = false
    holdRef.current = window.setTimeout(() => {
      heldRef.current = true
      onExit()
    }, 3000)
  }
  const holdEnd = () => {
    if (holdRef.current != null) {
      clearTimeout(holdRef.current)
      holdRef.current = null
    }
    if (!heldRef.current) {
      setLockHint(true)
      window.setTimeout(() => setLockHint(false), 2200)
    }
  }

  const quote = quoteForDisplay(now)
  const night = isNight(now)
  const un = unlocked(getStamps())
  const wl = weatherLine(wx)
  const rainy =
    !!wx &&
    (wx.warnings.some((x) => x.code.startsWith('WRAIN') || x.code.startsWith('TC')) ||
      Object.values(wx.rainfall).some((mm) => mm >= 5))
  const hot = !!wx?.tempC && wx.tempC >= 33

  const clock = now.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 星期${'日一二三四五六'[now.getDay()]}`

  return (
    <div
      className={`dmode ${night ? 'night' : ''}`}
      onPointerDown={holdStart}
      onPointerUp={holdEnd}
      onPointerLeave={holdEnd}
      onPointerCancel={holdEnd}
      onContextMenu={(e) => e.preventDefault()}
      role="button"
      aria-label="長按 3 秒退出顯示模式"
    >
      {lockHint && <div className="dm-lock">🔒 已鎖定 · 長按 3 秒先會退出</div>}
      <div className="dm-top">
        <div className="dm-logo"><PandaFace className="dm-logo-svg" /></div>
        <div>
          <div className="dm-clock">{clock}</div>
          <div className="dm-date">{dateStr} · 可可出行 ♡</div>
        </div>
        <div className="dm-quote">
          ✨ 是日名句:「{quote.q}」<span className="dm-src">——{quote.by}</span>
        </div>
        <div className="dm-wx">
          {wx?.tempC != null && <div className="dm-wx-t">{rainy ? '🌧' : '☀️'} {Math.round(wx.tempC)}°</div>}
          <div className="dm-wx-s">
            {wx?.humidity != null && <>濕度 {Math.round(wx.humidity)}%</>}
            {wl && <> · {wl}</>}
          </div>
          {wx?.warnings[0] && <div className="dm-warn">⚠️ {wx.warnings[0].name}</div>}
        </div>
      </div>

      <div className="dm-rows">
        {favs.length === 0 && (
          <div className="dm-empty">
            先喺搜尋頁收藏(⭐)你常搭嘅「路線+車站」,呢度就會顯示佢哋嘅實時到站~
          </div>
        )}
        {favs.map((f) => {
          const e = etas[`${f.co}|${f.route}|${f.bound}|${f.stopId}`]
          const m0 = e?.mins[0]
          return (
            <div className="dm-row" key={`${f.co}|${f.route}|${f.bound}|${f.stopId}`}>
              <div className={`dm-badge route-badge ${coClass(f.co)}`}>{f.route}</div>
              <div className="dm-info">
                <div className="dm-dest">往 {f.dest}</div>
                <div className="dm-stop">{f.stopName}</div>
              </div>
              <div className="dm-etas">
                {e == null ? (
                  <div className="dm-m1 na">…</div>
                ) : m0 == null ? (
                  <div className="dm-m1 na">冇班次</div>
                ) : (
                  <>
                    <div className={`dm-m1 ${m0 <= 3 ? 'soon' : ''}`}>
                      {m0 <= 0 ? '即將' : m0}
                      {m0 > 0 && <small>分</small>}
                    </div>
                    {e.mins.length > 1 && (
                      <div className="dm-mn">{e.mins.slice(1).map((m) => `${m}分`).join(', ')}</div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="dm-pair">
        <PandaFace className="dm-mascot" bow={un.includes('bow')} starEyes={un.includes('star')} umbrella={rainy} sweat={hot} />
        <BearFace className="dm-mascot" knight={un.includes('knight')} medal={un.includes('gold')} />
      </div>

      <div className="dm-foot">
        {news.length > 0 && (
          <>
            <span className="dm-news-tag">📰 是日新聞:</span>
            <span className="dm-news">{news[newsIdx % news.length]}</span>
          </>
        )}
        <span className="dm-upd">
          每 10 秒自動更新{updatedAt && ` · 最後更新 ${updatedAt.toLocaleTimeString('zh-HK', { hour12: false })}`} · 🔒 長按 3 秒退出
        </span>
      </div>
    </div>
  )
}
