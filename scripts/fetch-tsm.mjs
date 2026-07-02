// Build-time:抓取運輸署「策略性/主要道路交通數據」(2nd gen TSM) 路段幾何
//   → public/tsm/links.json  { "<SEGMENT_ID>": [[lat,lng],...], ... }
//   → public/tsm/meta.json   { live: <實時 XML URL> }
// 座標若係 HK1980 Grid(EPSG:2326)自動轉 WGS84;GeoJSON 已係 WGS84 就照用。
// ⚠️ fail-soft:任何失敗只 log 唔 throw(exit 0),前端見唔到檔案就自動隱藏路況圖。
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import proj4 from 'proj4'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dir, '..', 'public', 'tsm')

// EPSG:2326(HK1980 Grid)→ EPSG:4326,參數照 epsg.io/2326
const HK80 =
  '+proj=tmerc +lat_0=22.31213333333334 +lon_0=114.1785555555556 +k=1 ' +
  '+x_0=836694.05 +y_0=819069.8 +ellps=intl ' +
  '+towgs84=-162.619,-276.959,-161.764,0.067753,-2.24365,-1.15883,-1.09425 +units=m +no_defs'
const toWgs = proj4(HK80, proj4.WGS84)

// 第二代數據集(2021+,舊 hk-td-sm_1 已淘汰淨返 notification)
const CKAN_IDS = [
  'hk-td-sm_4-traffic-data-strategic-major-roads',
  'hk-td-sm_1-traffic-speed-map',
]
const DEFAULT_LIVE = 'https://resource.data.one.gov.hk/td/speedmap.xml'

async function get(url, asBuffer = false) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(45000),
    headers: { 'User-Agent': 'kkcx-build/1.0' },
  })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.text()
}

/** 由 CKAN 攞晒所有 resources(兩個 dataset 合併),並照 log 出嚟 */
async function listResources() {
  const all = []
  for (const id of CKAN_IDS) {
    try {
      const j = JSON.parse(
        await get(`https://data.gov.hk/en-data/api/3/action/package_show?id=${id}`),
      )
      const rs = j?.result?.resources ?? []
      console.log(`CKAN ${id}(${rs.length}):`)
      for (const r of rs) console.log(` - [${r.format}] ${r.name ?? ''} ${r.url}`)
      all.push(...rs)
    } catch (e) {
      console.log(`CKAN ${id} 失敗:${e.message}`)
    }
  }
  return all
}

// ---- 座標處理 ----
const round5 = (v) => Number(v.toFixed(5))

/** [x,y](可能係 HK1980 或 lng/lat)→ [lat,lng](WGS84);唔喺香港範圍回 null */
function toLatLng(x, y) {
  let lat
  let lng
  if (Math.abs(x) > 1000 || Math.abs(y) > 1000) {
    ;[lng, lat] = toWgs.forward([x, y])
  } else {
    // GeoJSON 慣例 [lng, lat]
    lng = x
    lat = y
  }
  if (lat < 22 || lat > 22.7 || lng < 113.7 || lng > 114.5) return null
  return [round5(lat), round5(lng)]
}

/** 座標序列 → path(有一點爛就棄成條) */
function toPath(coords) {
  const path = []
  for (const c of coords) {
    const p = toLatLng(Number(c[0]), Number(c[1]))
    if (!p) return null
    path.push(p)
  }
  return path.length >= 2 ? path : null
}

// ---- 格式 parser ----

/** GeoJSON FeatureCollection → links */
export function linksFromGeojson(text) {
  const j = JSON.parse(text)
  const feats = j?.features ?? []
  const out = {}
  let n = 0
  for (const f of feats) {
    const props = f?.properties ?? {}
    // 搵 id 欄位:segment/link + id,或就咁叫 ID
    const idKey = Object.keys(props).find((k) => /((segment|link|route).?_?id|^id$)/i.test(k))
    const id = idKey != null ? String(props[idKey]).trim() : ''
    if (!id) continue
    const g = f?.geometry
    let coords = null
    if (g?.type === 'LineString') coords = g.coordinates
    else if (g?.type === 'MultiLineString') coords = g.coordinates.flat()
    if (!coords?.length) continue
    const path = toPath(coords)
    if (!path) continue
    out[id] = path
    n++
  }
  if (n < 50) {
    console.log(`  [debug] GeoJSON features=${feats.length},首個 properties keys:`,
      feats[0] ? Object.keys(feats[0].properties ?? {}).join(',') : '(冇)')
    throw new Error(`GeoJSON 只解析到 ${n} 條 link`)
  }
  return out
}

/** CSV(WKT LINESTRING 欄 或 start/end E/N 欄)→ links */
export function linksFromCsv(text) {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('CSV 冇資料行')
  const header = rows[0].map((c) => String(c ?? ''))
  const find = (re) => header.findIndex((c) => re.test(c))
  const idCol = find(/((segment|link|route).?_?id|^"?id"?$)/i)
  const wktCol = find(/wkt|geometry|geom|shape/i)
  const out = {}
  let n = 0
  if (idCol >= 0 && wktCol >= 0) {
    // WKT LINESTRING (x y, x y, ...)
    for (let i = 1; i < rows.length; i++) {
      const id = String(rows[i][idCol] ?? '').trim()
      const wkt = String(rows[i][wktCol] ?? '')
      const m = /LINESTRING\s*\(([^)]+)\)/i.exec(wkt)
      if (!id || !m) continue
      const coords = m[1].split(',').map((pair) => pair.trim().split(/\s+/).map(Number))
      const path = toPath(coords)
      if (!path) continue
      out[id] = path
      n++
    }
  } else {
    // start/end E/N 欄
    const c = {
      id: idCol,
      sx: find(/(start|from).*(east|lng|lon|x)/i),
      sy: find(/(start|from).*(north|lat|y)/i),
      ex: find(/(end|to).*(east|lng|lon|x)/i),
      ey: find(/(end|to).*(north|lat|y)/i),
    }
    if (c.id < 0 || c.sx < 0 || c.sy < 0 || c.ex < 0 || c.ey < 0) {
      console.log(`  [debug] CSV header:${header.join(' | ').slice(0, 300)}`)
      throw new Error('CSV 搵唔到 id/WKT/座標欄')
    }
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      const id = String(r[c.id] ?? '').trim()
      const path = toPath([
        [Number(r[c.sx]), Number(r[c.sy])],
        [Number(r[c.ex]), Number(r[c.ey])],
      ])
      if (!id || !path) continue
      out[id] = path
      n++
    }
  }
  if (n < 50) {
    console.log(`  [debug] CSV header:${header.join(' | ').slice(0, 300)}`)
    console.log(`  [debug] 第二行:${(rows[1] ?? []).join(' | ').slice(0, 300)}`)
    throw new Error(`CSV 只解析到 ${n} 條 link`)
  }
  return out
}

export function parseCsv(text) {
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
  const text = await get(url)
  const t = text.trimStart()
  if (t.startsWith('{')) return linksFromGeojson(text)
  return linksFromCsv(text)
}

async function main() {
  let links = null
  let live = DEFAULT_LIVE

  if (process.env.TSM_URL) {
    try {
      links = await tryUrl(process.env.TSM_URL)
      console.log(`✓ 成功:${Object.keys(links).length} 條 link ← ${process.env.TSM_URL}`)
    } catch (e) {
      console.log(`  ✗ ${e.message}`)
    }
  } else {
    const resources = await listResources()
    // 實時 XML:攞第一個 xml resource
    const liveRes = resources.find((r) => /xml/i.test(`${r.format} ${r.url}`))
    if (liveRes) live = liveRes.url
    // 幾何:優先 GeoJSON/JSON,再 CSV(跳過 notification/spec/pdf/fgdb/kml)
    const geomCands = resources
      .filter((r) => !/notification|dataspec|pdf|fgdb|\.gdb|kml|kmz|gml/i.test(`${r.name} ${r.url}`))
      .filter((r) => /geojson|json|csv/i.test(`${r.format} ${r.url}`))
      .sort((a, b) => {
        const score = (r) => (/geojson/i.test(`${r.format} ${r.url}`) ? 0 : /json/i.test(`${r.format} ${r.url}`) ? 1 : 2)
        return score(a) - score(b)
      })
    for (const r of geomCands) {
      try {
        links = await tryUrl(r.url)
        console.log(`✓ 成功:${Object.keys(links).length} 條 link ← ${r.url}`)
        break
      } catch (e) {
        console.log(`  ✗ ${e.message}`)
      }
    }
  }

  if (links) {
    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(join(OUT_DIR, 'links.json'), JSON.stringify(links))
    writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify({ live }))
    console.log(`寫入 public/tsm/links.json + meta.json(live=${live})`)
  } else {
    console.log('全部來源失敗 —— 跳過(前端會自動隱藏路況圖,不影響部署)')
  }
}

// import 唔會自動跑(方便單元測試 parser)
if (process.argv[1] && /fetch-tsm\.mjs$/.test(process.argv[1])) await main()
