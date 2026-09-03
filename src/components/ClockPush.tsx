// 🖥️ 推送去藍牙小屏(SKD-CLOCK e-ink):揀收藏路線 → 連線 → 每分鐘畫到站圖推上去。
// 只喺支援 Web Bluetooth 嘅瀏覽器可用(桌面/安卓 Chrome、Edge;iOS 要用 Bluefy)。
import { useCallback, useEffect, useRef, useState } from 'react'
import { getEta, coClass, type Route } from '../api/bus'
import { getFavorites, favKey, type Favorite } from '../lib/store'
import { minutesUntil } from '../lib/time'
import { renderEtaPoster, type PosterRow } from '../lib/etaPoster'
import { SkdClock, bluetoothSupported, type ClockStatus } from '../lib/skdclock'

const REFRESH_MS = 60_000
const MAX_PICK = 2

const favToRoute = (f: Favorite): Route => ({
  co: f.co,
  route: f.route,
  bound: f.bound,
  service_type: f.serviceType,
  orig_tc: '',
  dest_tc: f.dest,
})

async function fetchRow(f: Favorite): Promise<PosterRow> {
  try {
    const list = await getEta(favToRoute(f), f.stopId)
    const t = Date.now()
    const mins = list
      .map((e) => (e.eta ? minutesUntil(e.eta, t) : null))
      .filter((m): m is number => m != null)
      .sort((a, b) => a - b)
      .slice(0, 3)
    return { route: f.route, dest: f.dest, stop: f.stopName, mins }
  } catch {
    return { route: f.route, dest: f.dest, stop: f.stopName, mins: [] }
  }
}

/** preview:threshold 成純黑白(+紅)去模擬 e-ink 觀感 */
function monoPreview(canvas: HTMLCanvasElement, tri: boolean) {
  const ctx = canvas.getContext('2d')!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    const isRed = tri && r > 150 && g < 110 && b < 110
    if (isRed) {
      d[i] = 227
      d[i + 1] = 0
      d[i + 2] = 0
    } else {
      const v = lum < 128 ? 0 : 255
      d[i] = d[i + 1] = d[i + 2] = v
    }
  }
  ctx.putImageData(img, 0, 0)
}

export default function ClockPush({ onExit }: { onExit: () => void }) {
  const supported = bluetoothSupported()
  const allFavs = useState<Favorite[]>(() => getFavorites())[0]
  const [picked, setPicked] = useState<string[]>(() => getFavorites().slice(0, MAX_PICK).map(favKey))
  const [status, setStatus] = useState<ClockStatus | null>(null)
  const [connected, setConnected] = useState(false)
  const [auto, setAuto] = useState(false)
  const [msg, setMsg] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const clockRef = useRef<SkdClock | null>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)

  const pickedKey = picked.join(',')
  const pickedFavs = allFavs.filter((f) => picked.includes(favKey(f)))

  const toggle = (f: Favorite) => {
    const k = favKey(f)
    setPicked((p) => {
      if (p.includes(k)) return p.filter((x) => x !== k)
      if (p.length >= MAX_PICK) return [p[1], k]
      return [...p, k]
    })
  }

  // 畫預覽(用屏尺寸,冇連線就用 296×128 三色做預設)
  const draw = useCallback(
    async (push: boolean) => {
      const cv = previewRef.current
      if (!cv) return
      const st = clockRef.current?.status
      const W = st?.width ?? 296
      const H = st?.height ?? 128
      const tri = st?.tri ?? true
      const rows = await Promise.all(pickedFavs.map(fetchRow))
      const now = new Date()
      const clock = now.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })
      const updatedLabel = `${clock} 更新`
      renderEtaPoster(cv, { width: W, height: H, tri, rows, clock, updatedLabel })
      monoPreview(cv, tri)
      if (push && clockRef.current?.connected) {
        setBusy(true)
        try {
          // 推送用原圖(未 threshold)俾 driver 自己 dither
          const src = document.createElement('canvas')
          renderEtaPoster(src, { width: W, height: H, tri, rows, clock, updatedLabel })
          await clockRef.current.pushCanvas(src)
          setMsg(`已推送 · ${clock}`)
        } catch (e) {
          setMsg(`推送失敗:${e instanceof Error ? e.message : '未知'}`)
        } finally {
          setBusy(false)
        }
      }
    },
    // 只想喺「揀咗邊幾條線」變先重建;其他 ref / setState 都係穩定嘅
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickedKey],
  )

  // 揀路線變 → 重畫預覽
  useEffect(() => {
    void draw(false)
  }, [draw])

  // auto 推送
  useEffect(() => {
    if (!auto || !connected) return
    void draw(true)
    const id = setInterval(() => void draw(true), REFRESH_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, connected, picked.join(',')])

  const connect = async () => {
    setMsg('連線中…')
    const c = new SkdClock()
    c.onStatus = (s) => setStatus({ ...s })
    c.onDisconnect = () => {
      setConnected(false)
      setAuto(false)
      setMsg('小屏已斷線')
    }
    clockRef.current = c
    try {
      await c.connect()
      setConnected(true)
      setStatus(c.status ? { ...c.status } : null)
      setMsg('已連線 ✓')
      await c.syncTime()
      void draw(false)
    } catch (e) {
      setMsg(`連唔到:${e instanceof Error ? e.message : '已取消'}`)
      clockRef.current = null
    }
  }

  const pushOnce = () => void draw(true)

  useEffect(() => {
    return () => {
      void clockRef.current?.disconnect()
    }
  }, [])

  return (
    <div className="clockpush">
      <div className="cp-head">
        <b>🖥️ 推送去藍牙小屏</b>
        <button className="fb-x" onClick={onExit} aria-label="返回">
          ✕
        </button>
      </div>

      {!supported ? (
        <div className="cp-warn">
          <p>呢部機/瀏覽器唔支援 Web Bluetooth,連唔到小屏。</p>
          <p className="muted small">
            👉 用 <b>Android 手機 Chrome</b> 或 <b>電腦 Chrome / Edge</b> 開呢版就得。 iPhone / iPad
            想用,可以裝免費嘅 <b>Bluefy</b> 瀏覽器再開。
          </p>
        </div>
      ) : (
        <>
          <p className="muted small">
            揀最多 {MAX_PICK} 條收藏路線,連上你部 SKD-CLOCK e-ink 小屏,佢就會每分鐘顯示最新到站。 小屏建議插住
            USB(e-ink 每分鐘 refresh,慳電但唔好靠電池長開)。
          </p>

          <div className="cp-favs">
            {allFavs.length === 0 && (
              <div className="muted small">未有收藏路線 —— 先喺搜尋頁⭐收藏返幾條先。</div>
            )}
            {allFavs.map((f) => {
              const k = favKey(f)
              const on = picked.includes(k)
              return (
                <button key={k} className={`cp-fav ${on ? 'on' : ''}`} onClick={() => toggle(f)}>
                  <span className={`route-badge ${coClass(f.co)} cp-fav-badge`}>{f.route}</span>
                  <span className="cp-fav-name">
                    往 {f.dest} · {f.stopName}
                  </span>
                  <span className="cp-fav-tick">{on ? '✓' : ''}</span>
                </button>
              )
            })}
          </div>

          <div className="cp-preview-wrap">
            <div className="cp-preview-label">
              小屏預覽(模擬 e-ink 黑白{status?.tri !== false ? '紅' : ''})
            </div>
            <canvas ref={previewRef} className="cp-preview" />
          </div>

          {connected && status && (
            <div className="cp-status">
              📟 {status.width}×{status.height} · {status.tri ? '三色' : '黑白'}
              {status.batteryMv ? ` · 電${(status.batteryMv / 1000).toFixed(2)}V` : ''}
              {status.tempC != null ? ` · ${status.tempC}°C` : ''}
              {status.fw ? ` · fw${status.fw}` : ''}
            </div>
          )}

          <div className="cp-btns">
            {!connected ? (
              <button className="primary-btn full" onClick={() => void connect()}>
                🔗 連線小屏
              </button>
            ) : (
              <>
                <button className="preset-chip" onClick={pushOnce} disabled={busy}>
                  {busy ? '推送中…' : '⬆️ 推送一次'}
                </button>
                <button className={`preset-chip ${auto ? 'on' : ''}`} onClick={() => setAuto((a) => !a)}>
                  {auto ? '⏸ 停止自動' : '▶️ 每分鐘自動推'}
                </button>
                <button className="preset-chip" onClick={() => void clockRef.current?.disconnect()}>
                  斷開
                </button>
              </>
            )}
          </div>

          {msg && <div className="cp-msg">{msg}</div>}
        </>
      )}
    </div>
  )
}
