// ETA 時間顯示工具
import type { Eta } from '../api/bus'

const etaMs = (e: Eta): number => (e.eta ? new Date(e.eta).getTime() : Infinity)

/** 按到站時間排序(冇時間嘅排最尾,同時間睇 eta_seq),取未來 3 班 */
export const nextEtas = (data: Eta[]): Eta[] =>
  [...data].sort((a, b) => etaMs(a) - etaMs(b) || a.eta_seq - b.eta_seq).slice(0, 3)

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

// ---- 網絡唔穩:保留上次成功嘅班次 ----

/** 上次成功嘅資料最多留幾耐(ETA 係絕對時間,幾分鐘內照計得準) */
export const STALE_MAX_MS = 5 * 60_000

/** 去走已經過咗 graceMs 以上嘅班次(冇時間嘅照留,佢哋帶住「服務時間已過」之類備註) */
export function freshEtas(etas: Eta[], now: number, graceMs = 60_000): Eta[] {
  return etas.filter((e) => !e.eta || new Date(e.eta).getTime() > now - graceMs)
}

/** 一個站嘅 ETA 狀態 */
export interface EtaSnapshot {
  /** 顯示緊嘅班次(未排序;顯示前用 nextEtas) */
  etas: Eta[]
  /** 上次成功攞到嘅時間;null = 從未成功 / 舊資料太舊已經掉咗 */
  fetchedAt: number | null
  /** 今次攞唔到嘅原因(俾用家睇嘅廣東話);有 fetchedAt = 顯示緊舊資料 */
  error: string | null
}

/** 今次攞唔到:5 分鐘內成功過就留返舊班次(去走過咗嘅),再舊就淨係報錯 */
export function keepStale(prev: EtaSnapshot | null | undefined, error: string, now: number): EtaSnapshot {
  if (prev?.fetchedAt == null || now - prev.fetchedAt > STALE_MAX_MS) {
    return { etas: [], fetchedAt: null, error }
  }
  return { etas: freshEtas(prev.etas, now), fetchedAt: prev.fetchedAt, error }
}

/** 上次成功超過呢個時間先當「舊」:正常 5 秒輪詢唔會去到 → 即係背景分頁返嚟,或者一路攞唔到 */
const OLD_AFTER_MS = 60_000

/**
 * 開始攞新資料之前:上次成功已經係一分鐘前嘅話,等緊新資料嗰陣唔好扮新鮮 ——
 * 去走過咗嘅班次 + 回新 object(分鐘數按而家重計);超過 5 分鐘就當冇
 * (本身已經攞唔到 → 直接變錯誤;否則 null = skeleton 等新資料)。
 * 啱啱先攞就原封不動:API 本身會帶埋啱啱開出嘅車,每轉都執會閃。
 */
export function ageSnapshot(prev: EtaSnapshot | null | undefined, now: number): EtaSnapshot | null {
  if (prev?.fetchedAt == null) return prev ?? null
  const age = now - prev.fetchedAt
  if (age > STALE_MAX_MS) return prev.error ? { etas: [], fetchedAt: null, error: prev.error } : null
  if (age < OLD_AFTER_MS) return prev
  return { ...prev, etas: freshEtas(prev.etas, now) }
}
