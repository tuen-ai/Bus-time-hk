// 📺 門口顯示模式嘅純邏輯(方便單元測試):ETA 新舊合併、斷線判斷、分鐘 tick。
// 重點:存「幾時到」(絕對時間),唔存「仲有幾分鐘」—— 斷咗網都會照倒數,唔會凍住扮新鮮。
import type { Eta } from '../api/bus'
import { etaMinutes } from './favRoute'

export interface RowEta {
  /** 最後一次成功攞到嘅班次(未成功過 = null) */
  etas: Eta[] | null
  /** 最後成功嗰輪嘅「請求發出時間」(epoch ms;未成功過 = 0)—— 用嚟比新舊 */
  okAt: number
  /** 最後成功之後連續失敗咗幾多輪 */
  fails: number
}

/** 連續失敗幾多輪就當「未能更新」(變灰 + 標記) */
export const STALE_FAILS = 2
/** 就算冇失敗記錄(例如請求卡住),資料舊過呢個都當未能更新 */
export const STALE_MS = 30_000
/** 舊過呢個嘅預測唔再可信 → 唔顯示分鐘,淨係講連線中斷 */
export const OFFLINE_MS = 5 * 60_000

/**
 * 一輪結果併入舊資料。etas = null 代表今輪失敗。
 * reqAt 係今輪請求發出時間:遲到嘅舊一輪(早過現有資料)唔會蓋咗新資料,亦唔當失敗。
 */
export function mergeRow(prev: RowEta | undefined, reqAt: number, etas: Eta[] | null): RowEta {
  if (prev && prev.etas && prev.okAt > reqAt) return prev
  if (etas) return { etas, okAt: reqAt, fails: 0 }
  return { etas: prev?.etas ?? null, okAt: prev?.okAt ?? 0, fails: (prev?.fails ?? 0) + 1 }
}

export type RowState = 'loading' | 'live' | 'stale' | 'offline'

export interface RowView {
  state: RowState
  /** 未來幾班嘅分鐘(每次 render 對住 now 重計;已走咗嘅班次自動跌出) */
  mins: number[]
}

/** 一行要點顯示:loading(…)/ live / stale(變灰照倒數)/ offline(連線中斷,唔出分鐘) */
export function rowView(row: RowEta | undefined, now: number, max = 3): RowView {
  if (!row) return { state: 'loading', mins: [] }
  if (!row.etas) return { state: row.fails >= STALE_FAILS ? 'offline' : 'loading', mins: [] }
  const age = now - row.okAt
  if (age > OFFLINE_MS) return { state: 'offline', mins: [] }
  const mins = etaMinutes(row.etas, now, max)
  const stale = row.fails >= STALE_FAILS || age > STALE_MS
  // 變灰之後啲車都走晒 → 唔知有冇新班次,唔好講「冇班次」
  if (stale && mins.length === 0) return { state: 'offline', mins }
  return { state: stale ? 'stale' : 'live', mins }
}

/** 距離下一個整分鐘(0 秒)仲有幾多 ms;加少少 buffer 確保 tick 嗰下已經過咗界 */
export function msToNextMinute(now: number): number {
  return 60_000 - (now % 60_000) + 50
}
