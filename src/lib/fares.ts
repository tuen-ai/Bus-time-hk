// 路線車費(逐站 sectional fare)。資料源自 hkbus routeFareList(build 時抽出)。
// 用動態 import 令 Vite 切做獨立 chunk,只喺睇路線詳情時先載入。
import type { Co } from '../api/bus'
import { memoAsync } from './cache'

type FareMap = Record<string, number[]>

// 成功先記住;chunk 載唔到唔記,下次再試
const load = memoAsync(
  () => import('../data/routeFares.json').then((m) => (m.default ?? m) as FareMap),
  Infinity,
)

/**
 * 取得一條路線逐站車費陣列($,index 對應站序);無資料回 null。
 * bound 可以係 OI / IO(城巴循環線,行程規劃用 planGraph 原本 key 查)。
 * 載入失敗今次當「車費未涵蓋」,唔拋錯(規劃器 fillFare 冇 catch)。
 */
export async function getFares(
  co: Co,
  route: string,
  bound: string,
  serviceType: string,
): Promise<number[] | null> {
  const map = await load().catch(() => null)
  return map?.[`${co}|${route}|${bound}|${serviceType}`] ?? null
}

export const fmtFare = (n: number): string => `$${n.toFixed(1)}`
