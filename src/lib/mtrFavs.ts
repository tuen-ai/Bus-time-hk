// 港鐵收藏(綫 + 站 + 方向)同鐵路頁「上次揀嘅綫 / 站」:純本機 localStorage,入備份。
// 刻意唔塞入巴士收藏(store.ts 嘅 Co / favKey / 顯示模式 / 藍牙小屏都靠嗰邊),自己一個細 store。
import type { StationSchedule, TrainArrival } from '../api/mtr'
import { getLine } from './mtrData'
import { lsGet, lsSet } from './ls'
import { STALE_MAX_MS } from './time'

export type MtrDir = 'UP' | 'DOWN'

export interface MtrFav {
  line: string
  sta: string
  /** API 嘅 UP / DOWN;目的地唔存(機場快綫 / 東鐵綫每班可以唔同),顯示時睇實時回應 */
  dir: MtrDir
}

export const MTR_FAVS_KEY = 'kkcx.mtrFavs'
const LAST_KEY = 'kkcx.mtr.last'
/** 首頁每個收藏站每 15 秒一個請求:最多 4 個,唔好拖慢首頁 / 食晒數據 */
export const MTR_FAVS_MAX = 4
/** 港鐵收藏加減 → 通知首頁 / 鐵路頁重讀 */
export const MTRFAVS_CHANGED = 'kkcx:mtrfavs-changed'

export const mtrFavKey = (f: MtrFav) => `${f.line}|${f.sta}|${f.dir}`
/** 同一個站(唔理方向):首頁一個站只攞一次時間表 */
export const mtrStaKey = (f: Pick<MtrFav, 'line' | 'sta'>) => `${f.line}|${f.sta}`

/** 呢條綫有冇呢個站(轉車站要綫 + 站一齊對) */
export const isMtrStation = (line: string, sta: string): boolean =>
  !!getLine(line)?.stations.some((s) => s.code === sta)

function parse(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function asFav(x: unknown): MtrFav | null {
  if (!x || typeof x !== 'object') return null
  const { line, sta, dir } = x as Record<string, unknown>
  if (typeof line !== 'string' || typeof sta !== 'string') return null
  if (dir !== 'UP' && dir !== 'DOWN') return null
  return isMtrStation(line, sta) ? { line, sta, dir } : null
}

/** 讀收藏:壞 JSON / 唔識嘅綫站(例如舊備份)靜靜哋略過,重複嘅只留一個,最多 MTR_FAVS_MAX 個 */
export function getMtrFavs(): MtrFav[] {
  const raw = parse(lsGet(MTR_FAVS_KEY))
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: MtrFav[] = []
  for (const x of raw) {
    const f = asFav(x)
    if (!f || seen.has(mtrFavKey(f))) continue
    seen.add(mtrFavKey(f))
    out.push(f)
    if (out.length >= MTR_FAVS_MAX) break
  }
  return out
}

export const isMtrFav = (f: MtrFav, list: MtrFav[] = getMtrFavs()): boolean =>
  list.some((x) => mtrFavKey(x) === mtrFavKey(f))

/** 滿咗(再加會超過上限) */
export const mtrFavsFull = (list: MtrFav[] = getMtrFavs()): boolean => list.length >= MTR_FAVS_MAX

/**
 * 加 / 減一個收藏(新嘅排最前)。滿咗或者唔識嘅站就唔加,原封不動回傳
 * (caller 用 isMtrFav 睇下加唔加到)。
 */
export function toggleMtrFav(f: MtrFav): MtrFav[] {
  const list = getMtrFavs()
  const idx = list.findIndex((x) => mtrFavKey(x) === mtrFavKey(f))
  if (idx >= 0) list.splice(idx, 1)
  else if (mtrFavsFull(list) || !isMtrStation(f.line, f.sta)) return list
  else list.unshift({ line: f.line, sta: f.sta, dir: f.dir })
  // 私密模式 / 容量滿寫唔到:照回傳記憶體版本令 UI 更新
  lsSet(MTR_FAVS_KEY, JSON.stringify(list))
  window.dispatchEvent(new Event(MTRFAVS_CHANGED))
  return list
}

// ---- 鐵路頁記住上次揀嘅綫 / 站 ----

export interface MtrLast {
  line: string
  sta: string | null
}

/** 上次揀嘅綫 / 站;冇 / 壞 / 綫已經唔存在 → null。站對唔到嗰條綫就淨係記綫 */
export function getMtrLast(): MtrLast | null {
  const raw = parse(lsGet(LAST_KEY))
  if (!raw || typeof raw !== 'object') return null
  const { line, sta } = raw as Record<string, unknown>
  if (typeof line !== 'string' || !getLine(line)) return null
  return { line, sta: typeof sta === 'string' && isMtrStation(line, sta) ? sta : null }
}

export function setMtrLast(v: MtrLast): void {
  lsSet(LAST_KEY, JSON.stringify({ line: v.line, sta: v.sta }))
}

// ---- 首頁卡:時間表狀態 + 顯示 ----

export const ttntLabel = (t: number): string => (t <= 0 ? '即將抵達' : `${t} 分鐘`)

/** 一個站嘅時間表狀態(同巴士收藏一樣:失敗保留上次成功最多 5 分鐘) */
export interface MtrSnap {
  sched: StationSchedule | null
  /** 上次成功攞到嘅時間;null = 從未成功 / 舊資料太舊已經掉咗 */
  fetchedAt: number | null
  /** 今次攞唔到嘅原因(廣東話);有 fetchedAt = 顯示緊舊資料 */
  error: string | null
  /** 分鐘數計到幾時(每次更新時設做「而家」,render 唔使讀時鐘) */
  at: number
}

export const freshMtrSnap = (sched: StationSchedule, now: number): MtrSnap => ({
  sched,
  fetchedAt: now,
  error: null,
  at: now,
})

/** 今次攞唔到:5 分鐘內成功過就留返舊時間表(標住舊),再舊就淨係報錯 */
export function keepMtrStale(prev: MtrSnap | undefined, error: string, now: number): MtrSnap {
  if (prev?.fetchedAt == null || !prev.sched || now - prev.fetchedAt > STALE_MAX_MS) {
    return { sched: null, fetchedAt: null, error, at: now }
  }
  return { ...prev, error, at: now }
}

/**
 * 開始攞新資料之前(背景分頁返嚟 / 斷咗網一排):舊過 1 分鐘就按而家重計分鐘;
 * 超過 5 分鐘就掉(本身已經攞唔到 → 變錯誤,否則 undefined = skeleton 等新資料)。
 * 啱啱先更新就原封不動,唔使重畫。
 */
export function ageMtrSnap(prev: MtrSnap | undefined, now: number): MtrSnap | undefined {
  if (prev?.fetchedAt == null) return prev
  if (now - prev.fetchedAt > STALE_MAX_MS) {
    return prev.error ? { sched: null, fetchedAt: null, error: prev.error, at: now } : undefined
  }
  if (now - prev.at < 60_000) return prev
  return { ...prev, at: now }
}

/** 顯示用:下 n 班;舊資料按過咗幾多分鐘扣返,已經開咗嘅唔要 */
export function upcomingTrains(trains: TrainArrival[], ageMs: number, n = 2): TrainArrival[] {
  const gone = Math.max(0, Math.floor(ageMs / 60_000))
  const out: TrainArrival[] = []
  for (const t of trains) {
    const ttnt = t.ttnt - gone
    if (ttnt < 0) continue
    out.push(gone ? { ...t, ttnt } : t)
    if (out.length >= n) break
  }
  return out
}
