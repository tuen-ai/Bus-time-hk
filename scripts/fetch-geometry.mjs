// Build-time:預先抓取 KMB 路線幾何到 public/geom/{gtfsId}-{O|I}.json
// 令前端可 same-origin fetch,徹底免 runtime 第三方依賴。
// 失敗/缺檔不致命 —— 前端會 fallback 去 hkbus.github.io 再 OSRM 再直線。
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')
const OUT = join(ROOT, 'public', 'geom')
const SRC = 'https://hkbus.github.io/route-waypoints'
const CONCURRENCY = 32

const map = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'kmbGtfs.json'), 'utf8'))

// 收集 unique {gtfsId}-{bound}
const keys = new Set()
for (const k of Object.keys(map)) {
  const [, bound] = k.split('|') // route|bound|serviceType
  keys.add(`${map[k]}-${bound}`)
}
const list = [...keys]
mkdirSync(OUT, { recursive: true })

let ok = 0
let fail = 0
let i = 0

async function worker() {
  while (i < list.length) {
    const key = list[i++]
    const dest = join(OUT, `${key}.json`)
    if (existsSync(dest)) {
      ok++
      continue
    }
    try {
      const ctrl = AbortSignal.timeout(15000)
      const res = await fetch(`${SRC}/${key}.json`, { signal: ctrl })
      if (!res.ok) {
        fail++
        continue
      }
      const text = await res.text()
      writeFileSync(dest, text)
      ok++
    } catch {
      fail++
    }
  }
}

console.log(`Baking ${list.length} route geometries → public/geom/ …`)
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
console.log(`Done. ok=${ok} fail=${fail} (fail 為缺檔/網絡,屬正常,前端會 runtime fallback)`)
