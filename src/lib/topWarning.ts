// 門口顯示模式得一粒警告 pill:要揀最嚴重嗰個。
// HKO warnsum 嘅次序唔跟嚴重程度(山泥 / 酷熱會排喺風球前面),唔可以就咁攞第一個。
import type { Warning } from '../api/weather'
import { isTyphoonCode, warnLevel } from './weather'

const LEVEL_RANK = { black: 3, red: 2, amber: 1 } as const

/** 嚴重程度分數:黑 > 紅 > 黃(同首頁天氣列 warnLevel 一套);同級嘅風球行先(三號 > 山泥 / 酷熱) */
export function warnRank(code: string): number {
  return LEVEL_RANK[warnLevel(code)] * 2 + (isTyphoonCode(code) ? 1 : 0)
}

/** 最嚴重嘅警告;同分跟返原本次序;冇警告 = null */
export function topWarning(ws: readonly Warning[] | null | undefined): Warning | null {
  let top: Warning | null = null
  for (const w of ws ?? []) {
    if (!top || warnRank(w.code) > warnRank(top.code)) top = w
  }
  return top
}
