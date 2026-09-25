// 設定面板(topbar ⚙️ 開):門口顯示模式 + 是日金句偏好 + 備份/還原。純本地,唔上傳。
import { useRef, useState } from 'react'
import { exportBackup, importBackup } from '../lib/backup'
import { zhErrorOr } from '../lib/errorText'
import { trapTab } from '../lib/focusTrap'
import { QUOTES, getQuotePref, setQuotePref, quoteOfToday, type QuotePref } from '../data/quotes'
import { getFavorites, moveFavorite, favKey, type Favorite } from '../lib/store'
import { coClass } from '../api/bus'

export default function BackupPanel({
  onClose,
  onEnterDisplay,
  onEnterClock,
}: {
  onClose: () => void
  onEnterDisplay?: () => void
  onEnterClock?: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [qp, setQp] = useState<QuotePref>(() => getQuotePref())
  const [favs, setFavs] = useState<Favorite[]>(() => getFavorites())

  const saveQp = (p: QuotePref) => {
    setQp(p)
    setQuotePref(p)
  }

  const onImport = async (f: File | undefined) => {
    if (!f) return
    try {
      const n = importBackup(await f.text())
      setMsg(`✅ 還原咗 ${n} 項資料,即刻生效~`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      // JSON.parse 嘅英文原文唔好直出
      setMsg(`⚠️ ${zhErrorOr(e, '讀唔到呢個檔,請揀返可可出行匯出嘅備份檔')}`)
    }
  }

  return (
    <div className="backup-overlay" onClick={onClose}>
      {/* Esc / 返回鍵由 App 嘅 useBackLayer 處理;閂返焦點會返去 ⚙️ */}
      <div
        className="backup-card"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => trapTab(e, cardRef.current)}
      >
        <div className="backup-head">
          <b id="backup-title">
            <span aria-hidden="true">⚙️ </span>設定
          </b>
          {/* 開版即刻將焦點放喺 ✕ */}
          <button className="fb-x" onClick={onClose} aria-label="關閉" autoFocus>
            ✕
          </button>
        </div>
        {onEnterDisplay && (
          <>
            <button className="primary-btn full" onClick={onEnterDisplay}>
              <span aria-hidden="true">📺 </span>門口顯示模式(iPad 橫擺)
            </button>
            <p className="muted small">
              大字時鐘 + 收藏路線實時到站 + 是日名句 + 新聞。iPad 加到主畫面後開 App 會自動返去顯示模式;設定 →
              螢幕顯示 → 自動鎖定揀「永不」+ 插住電, 就係一部門口報站機~畫面已鎖定,長按 3 秒先退出。
            </p>
            {favs.length > 1 && (
              <>
                <hr style={{ border: 'none', borderTop: '1px solid var(--line)' }} />
                <b className="small">
                  <span aria-hidden="true">↕️ </span>顯示排序(頭 6 個會出現喺顯示模式)
                </b>
                <div className="fav-order">
                  {favs.map((f, i) => (
                    <div className={`fav-order-row ${i >= 6 ? 'dim' : ''}`} key={favKey(f)}>
                      <span className={`route-badge ${coClass(f.co)} fav-order-badge`}>{f.route}</span>
                      <span className="fav-order-name">
                        往 {f.dest} · {f.stopName}
                      </span>
                      <button
                        type="button"
                        className="fav-order-btn"
                        disabled={i === 0}
                        onClick={() => setFavs(moveFavorite(i, -1))}
                        aria-label={`${f.route} 往上移`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="fav-order-btn"
                        disabled={i === favs.length - 1}
                        onClick={() => setFavs(moveFavorite(i, 1))}
                        aria-label={`${f.route} 往下移`}
                      >
                        ↓
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <hr style={{ border: 'none', borderTop: '1px solid var(--line)' }} />
            <b className="small">
              <span aria-hidden="true">✨ </span>是日金句
            </b>
            <div className="qp-modes">
              <button
                className={`preset-chip ${qp.mode === 'auto' ? 'on' : ''}`}
                aria-pressed={qp.mode === 'auto'}
                onClick={() => saveQp({ mode: 'auto' })}
              >
                <span aria-hidden="true">🔄 </span>每日自動轉
              </button>
              <button
                className={`preset-chip ${qp.mode === 'fixed' ? 'on' : ''}`}
                aria-pressed={qp.mode === 'fixed'}
                onClick={() => saveQp({ mode: 'fixed', idx: qp.mode === 'fixed' ? qp.idx : 0 })}
              >
                <span aria-hidden="true">📌 </span>固定一句
              </button>
              <button
                className={`preset-chip ${qp.mode === 'custom' ? 'on' : ''}`}
                aria-pressed={qp.mode === 'custom'}
                onClick={() => saveQp(qp.mode === 'custom' ? qp : { mode: 'custom', q: '', by: '' })}
              >
                <span aria-hidden="true">✍️ </span>自己寫
              </button>
            </div>
            {qp.mode === 'auto' && (
              <p className="muted small">
                今日:「{quoteOfToday().q}」——{quoteOfToday().by}(聽日會自動換過句)
              </p>
            )}
            {qp.mode === 'fixed' && (
              <>
                {/* 睇得到嘅標籤:撳個標籤都會 focus 落下拉 */}
                <label htmlFor="qp-fixed" className="small">
                  揀一句固定金句
                </label>
                <select
                  id="qp-fixed"
                  className="qp-select"
                  value={qp.idx}
                  onChange={(e) => saveQp({ mode: 'fixed', idx: Number(e.target.value) })}
                >
                  {QUOTES.map((x, i) => (
                    <option key={i} value={i}>
                      {x.q} ——{x.by}
                    </option>
                  ))}
                </select>
              </>
            )}
            {qp.mode === 'custom' && (
              <>
                <input
                  className="qp-input"
                  aria-label="自訂金句"
                  placeholder="寫低你嘅金句,例如:今日都要加油呀!"
                  value={qp.q}
                  maxLength={60}
                  onChange={(e) => saveQp({ mode: 'custom', q: e.target.value, by: qp.by })}
                />
                <input
                  className="qp-input"
                  aria-label="金句出處或署名"
                  placeholder="出處/署名(可留空,預設「自己」)"
                  value={qp.by}
                  maxLength={20}
                  onChange={(e) => saveQp({ mode: 'custom', q: qp.q, by: e.target.value })}
                />
              </>
            )}
            {onEnterClock && (
              <>
                <hr style={{ border: 'none', borderTop: '1px solid var(--line)' }} />
                <button className="primary-btn full" onClick={onEnterClock}>
                  <span aria-hidden="true">🖥️ </span>推送去藍牙小屏(SKD-CLOCK)
                </button>
                <p className="muted small">
                  將收藏路線到站畫成圖,推去你部藍牙 e-ink 小屏,每分鐘自動更新。 用桌面/安卓 Chrome 或 Edge
                  開至連到(iPhone/iPad 需要 Bluefy 瀏覽器)。
                </p>
              </>
            )}
            <hr style={{ border: 'none', borderTop: '1px solid var(--line)' }} />
            <b className="small">
              <span aria-hidden="true">💾 </span>備份與還原
            </b>
          </>
        )}
        <p className="muted small">
          收藏、家/公司地點、印仔、通勤習慣都存喺呢部機。轉電話前先匯出備份檔,
          喺新機開返可可出行再匯入就搬到家當。資料只喺你手,唔會上傳。
        </p>
        <button className="primary-btn full" onClick={() => void exportBackup()}>
          <span aria-hidden="true">📤 </span>匯出備份檔
        </button>
        <button className="preset-chip full-w" onClick={() => fileRef.current?.click()}>
          <span aria-hidden="true">📥 </span>匯入備份檔(還原)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void onImport(e.target.files?.[0])}
        />
        <div className="backup-msg" role="status">
          {msg}
        </div>
      </div>
    </div>
  )
}
