// 📺 門口顯示模式(iPad 橫擺 kiosk):
// 大時鐘 + 是日勵志名句 + 天氣 + 收藏路線大字 ETA(10 秒刷新)+ 新聞輪播 + 雙公仔。
// 19:00–07:00 自動轉深色;wake lock 防瞓;畫面鎖定 —— 長按 3 秒先退出,誤觸只會彈提示。
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from 'react'
import { getEta, coClass, type Eta } from '../api/bus'
import { getFavorites, favKey, type Favorite } from '../lib/store'
import { getWeather, type Weather } from '../api/weather'
import { quoteForDisplay } from '../data/quotes'
import { favToRoute } from '../lib/favRoute'
import { fetchJson } from '../lib/http'
import { weatherMood } from '../lib/weather'
import { mergeRow, msToNextMinute, rowView, type RowEta } from '../lib/kiosk'
import { PandaFace, BearFace } from './Mascots'
import { getStamps, unlocked } from '../lib/stamps'
import { useBackLayer } from '../hooks/useBackLayer'
import { usePolling } from '../hooks/usePolling'
import { isUpdateReady, onUpdateReady, reloadOnce } from '../lib/appUpdate'

const ETA_MS = 10_000
const NEWS_MS = 10 * 60_000
const NEWS_ROTATE_MS = 12_000
const MAX_ROWS = 6
const HOLD_MS = 3000
/** 有新版:冇人掂 60 秒就自動 reload(kiosk 冇人撳「更新」) */
const UPDATE_IDLE_MS = 60_000

const isNight = (d: Date) => d.getHours() >= 19 || d.getHours() < 7
const fmtMin = (m: number) => (m <= 0 ? '即將' : `${m}分`)

export default function DisplayMode({ onExit }: { onExit: () => void }) {
  const [now, setNow] = useState(() => new Date())
  const [favs] = useState<Favorite[]>(() => getFavorites().slice(0, MAX_ROWS))
  const [etas, setEtas] = useState<Record<string, RowEta>>({})
  const [wx, setWx] = useState<Weather | null>(null)
  const [news, setNews] = useState<string[]>([])
  const [newsIdx, setNewsIdx] = useState(0)
  /** 最後一次「成功」攞到 ETA 嘅時間(成輪失敗唔會郁) */
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const wakeRef = useRef<WakeLockSentinel | null>(null)

  // 時鐘只顯示到分鐘 → 對正每個整分鐘先 tick(唔使每秒成版重畫);背景時停,返嚟即刻補
  useEffect(() => {
    let id: number | null = null
    const arm = () => {
      id = window.setTimeout(() => {
        setNow(new Date())
        arm()
      }, msToNextMinute(Date.now()))
    }
    const onVis = () => {
      if (id != null) clearTimeout(id)
      id = null
      if (!document.hidden) {
        setNow(new Date())
        arm()
      }
    }
    if (!document.hidden) arm()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      if (id != null) clearTimeout(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // ETA 每 10 秒刷新(背景分頁暫停,返嚟即刻補)。
  // 存到站「絕對時間」,render 時先對住 now 計分鐘:攞唔到嘅線照倒數 + 變灰,唔會凍住扮新鮮。
  // 上一輪未返就唔疊(卡死 30 秒先照開新一輪)—— usePolling 自己會睇住,唔使再加 guard。
  // 逐行一返就即刻更新:一條慢線唔會拖住其他行;Promise.all 等齊先完,usePolling 先知呢輪完咗。
  const loadEtas = async () => {
    const reqAt = Date.now()
    await Promise.all(
      favs.map(async (f) => {
        const k = favKey(f)
        let list: Eta[] | null = null
        try {
          list = await getEta(favToRoute(f), f.stopId)
        } catch {
          // 呢條線今次攞唔到,下一輪再試
        }
        // 以請求時間比新舊:卡死後遲到嘅舊一輪唔會蓋咗新資料
        setEtas((prev) => ({ ...prev, [k]: mergeRow(prev[k], reqAt, list) }))
        // 「最後更新」只計成功:失敗唔好扮更新咗
        if (list) setUpdatedAt(new Date())
        setNow(new Date()) // 分鐘對住最新時間重計
      }),
    )
  }
  usePolling(loadEtas, ETA_MS, { enabled: favs.length > 0 })

  // 天氣(5 分鐘 cache 喺 api 層)+ 新聞,10 分鐘一次
  usePolling(() => {
    getWeather()
      .then(setWx)
      .catch(() => {})
    fetchJson<{ items?: string[] }>('./news.json')
      .then((j) => {
        if (j.items?.length) setNews(j.items)
      })
      .catch(() => {})
  }, NEWS_MS)

  // 新聞每 12 秒轉一條
  usePolling(() => setNewsIdx((i) => (i + 1) % Math.max(1, news.length)), NEWS_ROTATE_MS, {
    enabled: news.length > 1,
    immediate: false,
    key: news,
  })

  // Wake lock 防瞓(iPad Safari 16.4+;失效時靠 iPad 設定自動鎖定=永不)
  useEffect(() => {
    const acquire = async () => {
      try {
        // 舊 Safari 冇 wakeLock → optional chaining 直接略過
        wakeRef.current = (await navigator.wakeLock?.request('screen')) ?? null
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
      void wakeRef.current?.release()
    }
  }, [])

  // 🔒 鎖定:撳一下唔會退出(顯示提示),長按 3 秒先退出 —— 防小朋友/誤觸。
  // 逐隻手指(pointerId)記住:第二隻手指 / 手掌一掂到就取消長按,唔會漏低個 timer 3 秒後自己退出。
  const [lockHint, setLockHint] = useState(false)
  const holdRef = useRef<number | null>(null)
  const hintRef = useRef<number | null>(null)
  const heldRef = useRef(false)
  const pointersRef = useRef(new Set<number>())
  /** 有新版等緊 reload 時 = 重新計 60 秒;冇就 null */
  const reloadBumpRef = useRef<(() => void) | null>(null)
  const clearHold = () => {
    if (holdRef.current != null) clearTimeout(holdRef.current)
    holdRef.current = null
  }
  const showLockHint = useCallback(() => {
    setLockHint(true)
    if (hintRef.current != null) clearTimeout(hintRef.current)
    hintRef.current = window.setTimeout(() => setLockHint(false), 2200)
  }, [])
  const holdStart = (e: PointerEvent<HTMLDivElement>) => {
    reloadBumpRef.current?.() // 有人掂緊:自動更新再等多 60 秒
    const ps = pointersRef.current
    // primary = 新一下(之前冇手指喺度)→ 清走可能漏咗 pointerup 嘅舊記錄
    if (e.isPrimary) ps.clear()
    ps.add(e.pointerId)
    clearHold()
    heldRef.current = false
    if (ps.size > 1) return // 多過一隻手指 → 唔當長按
    holdRef.current = window.setTimeout(() => {
      holdRef.current = null
      heldRef.current = true
      onExit()
    }, HOLD_MS)
  }
  const holdEnd = (e: PointerEvent<HTMLDivElement>) => {
    // pointerup 之後通常跟住 pointerleave;滑鼠路過都會 leave —— 唔係按緊嘅就唔理
    if (!pointersRef.current.delete(e.pointerId)) return
    clearHold()
    if (!heldRef.current) showLockHint()
  }
  useEffect(
    () => () => {
      if (holdRef.current != null) clearTimeout(holdRef.current)
      if (hintRef.current != null) clearTimeout(hintRef.current)
    },
    [],
  )

  // 📦 新版就緒(SW 已經接手):閒置 60 秒自動 reload。顯示模式記喺 localStorage('kkcx.display'),
  // reload 完直接返嚟 kiosk。reloadOnce 10 分鐘最多一次,server 有事都唔會 reload 到停唔到。
  const updateReady = useSyncExternalStore(onUpdateReady, isUpdateReady)
  useEffect(() => {
    if (!updateReady) return
    let id: number | undefined
    const arm = () => {
      clearTimeout(id)
      id = window.setTimeout(() => {
        if (!reloadOnce()) arm() // 啱啱 reload 過:遲啲再試
      }, UPDATE_IDLE_MS)
    }
    arm()
    reloadBumpRef.current = arm
    return () => {
      clearTimeout(id)
      reloadBumpRef.current = null
    }
  }, [updateReady])

  // 鎖定嘅 kiosk 畫面:撳返回鍵唔會退出,亦唔會閂咗成個 app —— 只彈提示叫你長按 3 秒
  useBackLayer(true, onExit, { locked: true, onBlocked: showLockHint })

  // 名句一日一句:淨係日子變先重讀(唔使每次 render 讀 localStorage)
  const y = now.getFullYear()
  const mo = now.getMonth()
  const d = now.getDate()
  const quote = useMemo(() => quoteForDisplay(new Date(y, mo, d, 12)), [y, mo, d])
  // 顯示模式蓋住成個 app,印仔喺呢段時間唔會變
  const un = useMemo(() => unlocked(getStamps()), [])
  const night = isNight(now)
  const nowMs = now.getTime()
  const mood = weatherMood(wx)

  const clock = now.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })
  const dateStr = `${mo + 1}月${d}日 星期${'日一二三四五六'[now.getDay()]}`

  return (
    <div
      className={`dmode ${night ? 'night' : ''}`}
      onPointerDown={holdStart}
      onPointerUp={holdEnd}
      onPointerLeave={holdEnd}
      onPointerCancel={holdEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p className="sr-only">門口顯示模式,長按畫面 3 秒退出</p>
      <div role="status" aria-live="polite">
        {lockHint && (
          <div className="dm-lock">
            <span aria-hidden="true">🔒 </span>已鎖定 · 長按 3 秒先會退出
          </div>
        )}
      </div>
      <div className="dm-top">
        <div className="dm-logo">
          <PandaFace className="dm-logo-svg" />
        </div>
        <div>
          <div className="dm-clock">{clock}</div>
          <div className="dm-date">
            {dateStr} · 可可出行 <span aria-hidden="true">♡</span>
          </div>
        </div>
        <div className="dm-quote">
          <span aria-hidden="true">✨ </span>是日名句:「{quote.q}」
          <span className="dm-src">——{quote.by}</span>
        </div>
        <div className="dm-wx">
          {wx?.tempC != null && (
            <div className="dm-wx-t">
              <span aria-hidden="true">{mood.umbrella ? '🌧' : '☀️'} </span>
              {Math.round(wx.tempC)}°
            </div>
          )}
          <div className="dm-wx-s">
            {wx?.humidity != null && <>濕度 {Math.round(wx.humidity)}%</>}
            {mood.line && <> · {mood.line}</>}
          </div>
          {wx?.warnings[0] && (
            <div className="dm-warn">
              <span aria-hidden="true">⚠️ </span>
              {wx.warnings[0].name}
            </div>
          )}
        </div>
      </div>

      <div className="dm-rows">
        {favs.length === 0 && (
          <div className="dm-empty">先喺搜尋頁收藏(⭐)你常搭嘅「路線+車站」,呢度就會顯示佢哋嘅實時到站~</div>
        )}
        {favs.map((f) => {
          const k = favKey(f)
          const { state, mins } = rowView(etas[k], nowMs)
          const m0 = mins[0]
          const dim = state === 'stale' || state === 'offline' ? state : ''
          return (
            <div className={`dm-row ${dim}`} key={k}>
              {state === 'stale' && (
                <div className="dm-stale-tag">
                  <span aria-hidden="true">⚠️ </span>未能更新
                </div>
              )}
              <div className={`dm-badge route-badge ${coClass(f.co)}`}>{f.route}</div>
              <div className="dm-info">
                <div className="dm-dest">往 {f.dest}</div>
                <div className="dm-stop">{f.stopName}</div>
              </div>
              <div className="dm-etas">
                {state === 'loading' ? (
                  <div className="dm-m1 na">…</div>
                ) : state === 'offline' ? (
                  <div className="dm-m1 na">連線中斷</div>
                ) : m0 == null ? (
                  <div className="dm-m1 na">冇班次</div>
                ) : (
                  <>
                    <div className={`dm-m1 ${m0 <= 3 ? 'soon' : ''}`}>
                      {m0 <= 0 ? '即將' : m0}
                      {m0 > 0 && <small>分</small>}
                    </div>
                    {mins.length > 1 && <div className="dm-mn">{mins.slice(1).map(fmtMin).join(', ')}</div>}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 底部專屬一行:新聞/更新時間喺左,公仔企右 —— 卡片唔會遮到佢哋 */}
      <div className="dm-bottom">
        <div className="dm-foot">
          {news.length > 0 && (
            <>
              <span className="dm-news-tag">
                <span aria-hidden="true">📰 </span>是日新聞:
              </span>
              <span className="dm-news">{news[newsIdx % news.length]}</span>
            </>
          )}
          <span className="dm-upd">
            每 {ETA_MS / 1000} 秒自動更新
            {updatedAt && ` · 最後更新 ${updatedAt.toLocaleTimeString('zh-HK', { hour12: false })}`} ·{' '}
            <span aria-hidden="true">🔒</span> 長按 3 秒退出
          </span>
        </div>
        <div className="dm-pair">
          <PandaFace
            className="dm-mascot"
            bow={un.includes('bow')}
            starEyes={un.includes('star')}
            umbrella={mood.umbrella}
            sweat={mood.hot}
          />
          <BearFace className="dm-mascot" knight={un.includes('knight')} medal={un.includes('gold')} />
        </div>
      </div>
    </div>
  )
}
