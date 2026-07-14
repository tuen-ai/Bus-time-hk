// Build-time:抓香港新聞標題 → public/news.json { ts, items: [標題…] }
// 來源:RTHK 即時新聞 RSS(中文);配合 workflow cron 每 3 小時自動更新。
// fail-soft:失敗唔阻部署,前端見唔到檔就唔顯示新聞欄。
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dir, '..', 'public', 'news.json')

const FEEDS = [
  'https://rthk9.rthk.hk/rthk/news/rss/c_expressnews_clocal.xml', // 本地即時
  'https://rthk9.rthk.hk/rthk/news/rss/c_expressnews_cinternational.xml', // 國際(後備)
]

const MAX_ITEMS = 10

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

function parseTitles(xml) {
  const titles = []
  for (const m of xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>[\s\S]*?<\/item>/gi)) {
    const t = decodeEntities(m[1].trim()).replace(/\s+/g, ' ')
    if (t && t.length > 4) titles.push(t)
    if (titles.length >= MAX_ITEMS) break
  }
  return titles
}

async function main() {
  for (const url of FEEDS) {
    try {
      console.log(`news:嘗試 ${url}`)
      const res = await fetch(url, {
        headers: { 'User-Agent': 'kkcx-build/1.0' },
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const xml = await res.text()
      const items = parseTitles(xml)
      console.log(`  抽到 ${items.length} 條標題`)
      if (items.length >= 3) {
        mkdirSync(dirname(OUT), { recursive: true })
        writeFileSync(OUT, JSON.stringify({ ts: Date.now(), items }))
        console.log(`✓ 寫入 public/news.json(${items.length} 條)`)
        return
      }
    } catch (e) {
      console.log(`  ✗ ${e.message}`)
    }
  }
  console.log('全部 feed 失敗 —— 跳過(前端唔顯示新聞欄)')
}

if (process.argv[1] && /fetch-news\.mjs$/.test(process.argv[1])) await main()
