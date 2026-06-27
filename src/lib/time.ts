// ETA 時間顯示工具

/** 將 ETA timestamp 轉成「仲有 X 分鐘」。已過/即將到站顯示「即將到達」。 */
export function minutesUntil(eta: string | null, now: number = Date.now()): number | null {
  if (!eta) return null
  const diffMs = new Date(eta).getTime() - now
  return Math.round(diffMs / 60000)
}

export function etaLabel(eta: string | null, now?: number): string {
  const mins = minutesUntil(eta, now)
  if (mins === null) return '暫無班次'
  if (mins <= 0) return '即將到達'
  return `${mins} 分鐘`
}

/** HH:mm(香港時間)*/
export function clockLabel(iso: string | null): string {
  if (!iso) return '--:--'
  return new Date(iso).toLocaleTimeString('zh-HK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Hong_Kong',
  })
}
