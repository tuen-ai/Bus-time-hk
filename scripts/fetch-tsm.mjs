// Build-time:抓取運輸署「交通速度圖」(TSM) link 幾何 → public/tsm/links.json
// { "<LINK_ID>": [[lat,lng],[lat,lng]], ... }(每條 link 一段直線,概覽夠用)
// 來源座標係 HK1980 Grid(EPSG:2326)→ 轉 WGS84。
// ⚠️ fail-soft:任何失敗只 log 唔 throw(exit 0),前端見唔到檔案就自動隱藏路況圖。
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import proj4 from 'proj4'
import * as XLSX from 'xlsx'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dir, '..', 'public', 'tsm')

// EPSG:2326(HK1980 Grid)→ EPSG:4326,參數照 epsg.io/2326
const HK80 =
  '+proj=tmerc +lat_0=22.31213333333334 +lon_0=114.1785555555556 +k=1 ' +
  '+x_0=836694.05 +y_0=819069.8 +ellps=intl ' +
  '+towgs84=-162.619,-276.959,-161.764,0.067753,-2.24365,-1.15883,-1.09425 +units=m +no_defs'
const toWgs = proj4(HK80, proj4.WGS84)

// CKAN dataset id(自動發現資源 URL)+ 已知直接 URL 後備
const CKAN = 'https://data.gov.hk/en-data/api/3/action/package_show?id=hk-td-sm_1-traffic-speed-map'
const FALLBACK_URLS = [
  'https://static.data.gov.hk/td/traffic-speed-map/en/tsm_link_and_node_info_v2.xlsx',
  'https://static.data.gov.hk/td/traffic-speed-map/en/tsm_link_and_node_info.xlsx',
  'https://static.data.gov.hk/td/traffic-speed-map/tc/tsm_link_and_node_info_v2.xlsx',
]

async function get(url, asBuffer = false) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { 'User-Agent': 'kkcx-build/1.0' },
  })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.text()
}

/** 由 CKAN 資源列表搵 link/node 座標檔 */
async function discoverUrls() {
  try {
    const j = JSON.parse(await get(CKAN))
    const resources = j?.result?.resources ?? []
    console.log('CKAN resources:')
    for (const r of resources) console.log(` - [${r.format}] ${r.url}`)
    return resources
      .filter((r) => /link|node/i.test(`${r.name} ${r.url}`) && /xlsx|csv/i.test(`${r.format} ${r.url}`))
      .map((r) => r.url)
  } catch (e) {
    console.log(`CKAN discover 失敗(${e.message}),用後備 URL`)
    return []
  }
}

/** rows(第一行內搵 header)→ { linkId: [[lat,lng],[lat,lng]] } */
function rowsToLinks(rows) {
  // 搵 header 行:包含 link + east/north 字眼
  let hi = -1
  let cols = null
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i].map((c) => String(c ?? ''))
    const find = (re) => cells.findIndex((c) => re.test(c))
    const c = {
      id: find(/link.?id/i),
      sx: find(/(start|from).*(east|x)/i),
      sy: find(/(start|from).*(north|y)/i),
      ex: find(/(end|to).*(east|x)/i),
      ey: find(/(end|to).*(north|y)/i),
    }
    if (c.id >= 0 && c.sx >= 0 && c.sy >= 0 && c.ex >= 0 && c.ey >= 0) {
      hi = i
      cols = c
      break
    }
  }
  if (!cols) throw new Error('搵唔到 header 欄位(link id / easting / northing)')
  const out = {}
  let n = 0
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]
    const id = String(r[cols.id] ?? '').trim()
    const sx = Number(r[cols.sx])
    const sy = Number(r[cols.sy])
    const ex = Number(r[cols.ex])
    const ey = Number(r[cols.ey])
    if (!id || !sx || !sy || !ex || !ey) continue
    const [lng1, lat1] = toWgs.forward([sx, sy])
    const [lng2, lat2] = toWgs.forward([ex, ey])
    // 合理性檢查(香港範圍)
    if (lat1 < 22 || lat1 > 22.7 || lng1 < 113.7 || lng1 > 114.5) continue
    out[id] = [
      [Number(lat1.toFixed(5)), Number(lng1.toFixed(5))],
      [Number(lat2.toFixed(5)), Number(lng2.toFixed(5))],
    ]
    n++
  }
  if (n < 50) throw new Error(`只解析到 ${n} 條 link,似乎唔啱格式`)
  return out
}

function parseCsv(text) {
  // 簡單 CSV(處理引號欄位)
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const cells = []
      let cur = ''
      let q = false
      for (const ch of line) {
        if (ch === '"') q = !q
        else if (ch === ',' && !q) {
          cells.push(cur)
          cur = ''
        } else cur += ch
      }
      cells.push(cur)
      return cells
    })
}

async function tryUrl(url) {
  console.log(`嘗試 ${url}`)
  if (/\.csv(\?|$)/i.test(url)) {
    return rowsToLinks(parseCsv(await get(url)))
  }
  const buf = await get(url, true)
  const wb = XLSX.read(buf, { type: 'buffer' })
  // 逐個 sheet 試(座標可能唔喺第一個)
  let lastErr = null
  for (const name of wb.SheetNames) {
    try {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true })
      return rowsToLinks(rows)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error('冇 sheet 解析到')
}

// TSM_URL env 可以直接指定來源(測試/discovery 壞咗時 pin 住用)
const urls = process.env.TSM_URL
  ? [process.env.TSM_URL]
  : [...(await discoverUrls()), ...FALLBACK_URLS]
let links = null
for (const url of urls) {
  try {
    links = await tryUrl(url)
    console.log(`✓ 成功:${Object.keys(links).length} 條 link ← ${url}`)
    break
  } catch (e) {
    console.log(`  ✗ ${e.message}`)
  }
}

if (links) {
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'links.json'), JSON.stringify(links))
  console.log(`寫入 public/tsm/links.json`)
} else {
  console.log('全部來源失敗 —— 跳過(前端會自動隱藏路況圖,不影響部署)')
}
