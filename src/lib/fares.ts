// 路線車費(逐站 sectional fare)。資料源自 hkbus routeFareList(build 時抽出)。
// 用動態 import 令 Vite 切做獨立 chunk,只喺睇路線詳情時先載入。
import type { Co } from '../api/bus'

type FareMap = Record<string, number[]>

let promise: Promise<FareMap> | null = null

function load(): Promise<FareMap> {
  if (!promise) {
    promise = import('../data/routeFares.json')
      .then((m) => (m.default ?? m) as FareMap)
      .catch(() => ({}) as FareMap)
  }
  return promise
}

/** 取得一條路線逐站車費陣列($,index 對應站序);無資料回 null */
export async function getFares(
  co: Co,
  route: string,
  bound: 'I' | 'O',
  serviceType: string,
): Promise<number[] | null> {
  const map = await load()
  return map[`${co}|${route}|${bound}|${serviceType}`] ?? null
}

export const fmtFare = (n: number): string => `$${n.toFixed(1)}`
