// 細 IndexedDB key-value 層(唔用第三方 lib)。
//
// 大快取(路線清單幾 MB、九巴 6000+ 個站)以前放 localStorage —— Safari 上限約 5MB,
// 爆咗係靜默失敗,結果每次開 app 都要重新 fetch。IndexedDB 冇呢個上限。
//
// - 開唔到 IndexedDB(私密模式 / 舊瀏覽器 / 被封)→ 記憶體 fallback,同一 session 內仍然有效
// - 第一次讀時如果 localStorage 仲有舊 key → 自動搬過嚟再刪走(一次性遷移)
// - ErrorBoundary「清走快取」會 deleteDatabase(DB_NAME)

export const DB_NAME = 'kkcx'
const STORE = 'kv'

interface Cached<T> {
  ts: number
  data: T
}

let dbP: Promise<IDBDatabase | null> | null = null
const mem = new Map<string, Cached<unknown>>()

function openDb(): Promise<IDBDatabase | null> {
  if (dbP) return dbP
  dbP = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => {
        const db = req.result
        // 另一個分頁升級版本 → 呢邊閂咗,下次再開
        db.onversionchange = () => {
          db.close()
          dbP = null
        }
        resolve(db)
      }
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbP
}

function request<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(undefined)
        try {
          const req = run(db.transaction(STORE, mode).objectStore(STORE))
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => resolve(undefined)
        } catch {
          resolve(undefined)
        }
      }),
  )
}

/** 由 localStorage 搬舊資料過嚟(一次性);搬完刪走 */
function migrateFromLocalStorage<T>(key: string): Cached<T> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cached<T>
    if (typeof parsed?.ts !== 'number') return null
    localStorage.removeItem(key)
    return parsed
  } catch {
    return null
  }
}

/**
 * 讀快取。回 { data, age }(age = 幾耐之前寫入,ms);過咗 maxAgeMs 或者冇就 null。
 * caller 可以用 age 做 stale-while-revalidate(例如 1 日內即用、過咗就背景刷新)。
 */
export async function cacheGet<T>(key: string, maxAgeMs: number): Promise<{ data: T; age: number } | null> {
  let hit =
    (await request<Cached<T>>('readonly', (s) => s.get(key))) ?? (mem.get(key) as Cached<T> | undefined)
  if (!hit) {
    const moved = migrateFromLocalStorage<T>(key)
    if (moved) {
      hit = moved
      void cachePut(key, moved.data, moved.ts)
    }
  }
  if (!hit || typeof hit.ts !== 'number') return null
  const age = Date.now() - hit.ts
  if (age > maxAgeMs) return null
  return { data: hit.data, age }
}

/** 寫快取(IndexedDB 唔得就記憶體) */
export async function cachePut<T>(key: string, data: T, ts = Date.now()): Promise<void> {
  const value: Cached<T> = { ts, data }
  mem.set(key, value)
  await request('readwrite', (s) => s.put(value, key))
}

export async function cacheDel(key: string): Promise<void> {
  mem.delete(key)
  await request('readwrite', (s) => s.delete(key))
}

/** 測試用:重設連線 + 記憶體 */
export function _resetKvForTests(): void {
  dbP = null
  mem.clear()
}
