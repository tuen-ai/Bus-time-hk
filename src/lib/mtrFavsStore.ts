// 港鐵收藏嘅「輕」部分:首頁 / App 首屏要用,但唔可以 import mtrData(成份綫站表 ~16KB 會入首屏 bundle)。
// 讀 / 改收藏(要對站表驗證)喺 mtrFavs.ts,嗰邊會 re-export 呢度全部嘢。
import { lsGet, lsSet } from './ls'

export const MTR_FAVS_KEY = 'kkcx.mtrFavs'
export const MTR_LAST_KEY = 'kkcx.mtr.last'
/** 港鐵收藏加減 → 通知首頁 / 鐵路頁重讀 */
export const MTRFAVS_CHANGED = 'kkcx:mtrfavs-changed'

export interface MtrLast {
  line: string
  sta: string | null
}

export function setMtrLast(v: MtrLast): void {
  lsSet(MTR_LAST_KEY, JSON.stringify({ line: v.line, sta: v.sta }))
}

/**
 * 有冇港鐵收藏(首頁排法 / 使唔使載港鐵收藏卡)。唔查站表:形狀啱(line、sta 係字串,dir UP / DOWN)就算,
 * 同 getMtrFavs 嘅 asFav 一樣剔走壞資料;站碼唔識嘅極少數情況,張卡自己會乜都唔出。
 */
export function hasMtrFavs(): boolean {
  try {
    const a: unknown = JSON.parse(lsGet(MTR_FAVS_KEY) ?? '[]')
    return (
      Array.isArray(a) &&
      a.some((x) => {
        const o = x as Record<string, unknown> | null
        return (
          !!o &&
          typeof o.line === 'string' &&
          typeof o.sta === 'string' &&
          (o.dir === 'UP' || o.dir === 'DOWN')
        )
      })
    )
  } catch {
    return false // 壞 JSON 當冇
  }
}
