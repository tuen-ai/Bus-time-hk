// ETA 時間顯示工具
import type { Eta } from '../api/bus'

/** 按 eta_seq 排序,取未來 3 班 */
export const nextEtas = (data: Eta[]): Eta[] => [...data].sort((a, b) => a.eta_seq - b.eta_seq).slice(0, 3)

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
