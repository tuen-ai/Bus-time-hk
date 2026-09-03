// 備份/還原:將本機資料打包做 JSON 檔(轉電話用)。
// 純本地操作,唔會上傳去任何地方。
const BACKUP_KEYS = [
  'kmb.theme',
  'kmb.favorites',
  'places.saved',
  'kkcx.usage',
  'kkcx.stamps',
  'kkcx.quote', // 是日金句偏好
  'kkcx.nearby.co', // 附近預設營辦商
] as const

interface BackupFile {
  app: 'kkcx'
  version: 1
  exportedAt: string
  data: Record<string, string>
}

export function makeBackup(): string {
  const data: Record<string, string> = {}
  for (const k of BACKUP_KEYS) {
    const v = localStorage.getItem(k)
    if (v != null) data[k] = v
  }
  const file: BackupFile = {
    app: 'kkcx',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  }
  return JSON.stringify(file, null, 1)
}

/** 匯出:優先行動裝置 share sheet(AirDrop/WhatsApp),後備直接下載 */
export async function exportBackup(): Promise<void> {
  const json = makeBackup()
  const name = `kkcx-backup-${new Date().toISOString().slice(0, 10)}.json`
  const blob = new Blob([json], { type: 'application/json' })
  const file = new File([blob], name, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '可可出行備份' })
      return
    } catch {
      /* 用戶取消 share → 落去下載 */
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** 匯入:驗證格式 + 只寫白名單 key。回傳還原咗幾多項。 */
export function importBackup(json: string): number {
  const f = JSON.parse(json) as BackupFile
  if (f?.app !== 'kkcx' || !f.data) throw new Error('唔係可可出行嘅備份檔')
  let n = 0
  for (const k of BACKUP_KEYS) {
    if (typeof f.data[k] === 'string') {
      localStorage.setItem(k, f.data[k])
      n++
    }
  }
  if (!n) throw new Error('備份檔入面冇資料')
  return n
}
