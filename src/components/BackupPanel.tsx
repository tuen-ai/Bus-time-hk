// 設定面板(topbar ⚙️ 開):門口顯示模式 + 是日金句偏好 + 備份/還原。純本地,唔上傳。
import { useRef, useState } from 'react'
import { exportBackup, importBackup } from '../lib/backup'
import { QUOTES, getQuotePref, setQuotePref, quoteOfToday, type QuotePref } from '../data/quotes'

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
  const [msg, setMsg] = useState<string | null>(null)
  const [qp, setQp] = useState<QuotePref>(() => getQuotePref())

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
      setMsg(`⚠️ ${e instanceof Error ? e.message : '匯入失敗'}`)
    }
  }

  return (
    <div className="backup-overlay" onClick={onClose}>
      <div className="backup-card" onClick={(e) => e.stopPropagation()}>
        <div className="backup-head">
          <b>⚙️ 設定</b>
          <button className="fb-x" onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </div>
        {onEnterDisplay && (
          <>
            <button className="primary-btn full" onClick={onEnterDisplay}>
              📺 門口顯示模式(iPad 橫擺)
            </button>
            <p className="muted small">
              大字時鐘 + 收藏路線實時到站 + 是日名句 + 新聞。iPad 加到主畫面後開 App 會自動返去顯示模式;設定 →
              螢幕顯示 → 自動鎖定揀「永不」+ 插住電, 就係一部門口報站機~畫面已鎖定,長按 3 秒先退出。
            </p>
            <hr style={{ border: 'none', borderTop: '1px solid var(--line)' }} />
            <b className="small">✨ 是日金句</b>
            <div className="qp-modes">
              <button
                className={`preset-chip ${qp.mode === 'auto' ? 'on' : ''}`}
                onClick={() => saveQp({ mode: 'auto' })}
              >
                🔄 每日自動轉
              </button>
              <button
                className={`preset-chip ${qp.mode === 'fixed' ? 'on' : ''}`}
                onClick={() => saveQp({ mode: 'fixed', idx: qp.mode === 'fixed' ? qp.idx : 0 })}
              >
                📌 固定一句
              </button>
              <button
                className={`preset-chip ${qp.mode === 'custom' ? 'on' : ''}`}
                onClick={() => saveQp(qp.mode === 'custom' ? qp : { mode: 'custom', q: '', by: '' })}
              >
                ✍️ 自己寫
              </button>
            </div>
            {qp.mode === 'auto' && (
              <p className="muted small">
                今日:「{quoteOfToday().q}」——{quoteOfToday().by}(聽日會自動換過句)
              </p>
            )}
            {qp.mode === 'fixed' && (
              <select
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
            )}
            {qp.mode === 'custom' && (
              <>
                <input
                  className="qp-input"
                  placeholder="寫低你嘅金句,例如:今日都要加油呀!"
                  value={qp.q}
                  maxLength={60}
                  onChange={(e) => saveQp({ mode: 'custom', q: e.target.value, by: qp.by })}
                />
                <input
                  className="qp-input"
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
                  🖥️ 推送去藍牙小屏(SKD-CLOCK)
                </button>
                <p className="muted small">
                  將收藏路線到站畫成圖,推去你部藍牙 e-ink 小屏,每分鐘自動更新。 用桌面/安卓 Chrome 或 Edge
                  開至連到(iPhone/iPad 需要 Bluefy 瀏覽器)。
                </p>
              </>
            )}
            <hr style={{ border: 'none', borderTop: '1px solid var(--line)' }} />
            <b className="small">💾 備份與還原</b>
          </>
        )}
        <p className="muted small">
          收藏、家/公司地點、印仔、通勤習慣都存喺呢部機。轉電話前先匯出備份檔,
          喺新機開返可可出行再匯入就搬到家當。資料只喺你手,唔會上傳。
        </p>
        <button className="primary-btn full" onClick={() => void exportBackup()}>
          📤 匯出備份檔
        </button>
        <button className="preset-chip full-w" onClick={() => fileRef.current?.click()}>
          📥 匯入備份檔(還原)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void onImport(e.target.files?.[0])}
        />
        {msg && <div className="backup-msg">{msg}</div>}
      </div>
    </div>
  )
}
