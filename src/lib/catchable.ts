// 步行時間 +「趕唔趕到」:純計數,唔 fetch、唔問位置。
// ETA 同直線距離都係估算 → UI 一定要講「約」「應該」,唔好扮準。
import type { Eta } from '../api/bus'

/** 步行速度(米/分鐘);行程規劃(journey.ts)都用呢個,全 app 得一個 */
export const WALK_MPM = 80
/** 直線距離 → 實際路程(過馬路、兜路、等燈) */
export const DETOUR = 1.25
/** 預留幾多分鐘(搵站牌、車早到少少) */
export const BUFFER_MIN = 1
/** 收藏步行時間上限(分鐘) */
export const WALK_MAX = 30

const MIN_MS = 60_000

/** 直線距離(米)→ 步行約幾多分鐘;向上取整,寧願早啲出門 */
export function walkFromDist(m: number): number {
  if (!Number.isFinite(m) || m <= 0) return 0
  return Math.ceil((m * DETOUR) / WALK_MPM)
}

/** 備份 / 舊資料讀返嚟嘅步行時間:唔係 1–30 嘅數字就當冇設定 */
export function validWalk(x: unknown): number | undefined {
  if (typeof x !== 'number' || !Number.isFinite(x)) return undefined
  const m = Math.round(x)
  return m > 0 ? Math.min(m, WALK_MAX) : undefined
}

export interface CatchPlan {
  /** 同輸入同 index:true = 趕唔切(冇時間嘅班次永遠 false) */
  missed: boolean[]
  /** 第一班趕得切嘅 index;null = 冇班次 / 全部趕唔切 */
  catchIdx: number | null
  /** 最遲幾時出門(ms,已扣埋預留);null = 冇得趕 */
  leaveAt: number | null
  /** 離最遲出門仲有幾多 ms;null = 冇得趕 */
  slackMs: number | null
  /** 鬆動 ≤ 1 分鐘 →「而家即刻出門!」 */
  leaveNow: boolean
}

/**
 * 核心:用毫秒比(eta − now ≥ (步行 + 預留) 分鐘)。
 * 唔好用 minutesUntil 四捨五入嘅分鐘比 —— 啱啱喺邊界嗰陣會一閃一閃。
 */
export function catchPlanMs(
  etaMs: (number | null)[],
  walkMins: number,
  now: number,
  bufferMin = BUFFER_MIN,
): CatchPlan {
  const need = (Math.max(0, walkMins) + Math.max(0, bufferMin)) * MIN_MS
  const known = (t: number | null): t is number => t != null && Number.isFinite(t)
  const missed = etaMs.map((t) => known(t) && t - now < need)
  const idx = etaMs.findIndex((t, i) => known(t) && !missed[i])
  if (idx < 0) return { missed, catchIdx: null, leaveAt: null, slackMs: null, leaveNow: false }
  const leaveAt = (etaMs[idx] as number) - need
  const slackMs = leaveAt - now
  return { missed, catchIdx: idx, leaveAt, slackMs, leaveNow: slackMs <= MIN_MS }
}

const toMs = (iso: string | null): number | null => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : null
}

/** ETA 列表版本(收藏卡);次序跟返傳入嘅 etas */
export function catchPlan(etas: Eta[], walkMins: number, now: number = Date.now()): CatchPlan {
  return catchPlanMs(
    etas.map((e) => toMs(e.eta)),
    walkMins,
    now,
  )
}

/** 分鐘版本(附近 NearbyRow.mins 本身已經係四捨五入嘅分鐘,冇 timestamp) */
export function catchPlanMins(
  mins: number[],
  walkMins: number,
  bufferMin = BUFFER_MIN,
): Pick<CatchPlan, 'missed' | 'catchIdx'> {
  const { missed, catchIdx } = catchPlanMs(
    mins.map((m) => m * MIN_MS),
    walkMins,
    0,
    bufferMin,
  )
  return { missed, catchIdx }
}
