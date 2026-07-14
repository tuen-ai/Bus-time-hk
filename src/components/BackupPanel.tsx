// 備份/還原面板(topbar ⚙️ 開):匯出檔案 / 匯入還原。純本地,唔上傳。
import { useRef, useState } from 'react'
import { exportBackup, importBackup } from '../lib/backup'

export default function BackupPanel({
  onClose,
  onEnterDisplay,
}: {
  onClose: () => void
  onEnterDisplay?: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)

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
          <button className="fb-x" onClick={onClose} aria-label="關閉">✕</button>
        </div>
        {onEnterDisplay && (
          <>
            <button className="primary-btn full" onClick={onEnterDisplay}>
              📺 門口顯示模式(iPad 橫擺)
            </button>
            <p className="muted small">
              大字時鐘 + 收藏路線實時到站 + 是日名句 + 新聞。iPad 加到主畫面後開
              App 會自動返去顯示模式;設定 → 螢幕顯示 → 自動鎖定揀「永不」+ 插住電,
              就係一部門口報站機~撳一下屏幕退出。
            </p>
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
