// Build-time:砌「主要道路實時車速」路段幾何 → public/tsm/
//   links.json  { "<segment_id>": [[lat,lng],...], ... }
//   meta.json   { live: <實時 XML URL> }
// 資料模型(2nd gen):
//   - 實時車速: resource.data.one.gov.hk/td/traffic-detectors/irnAvgSpeed-all.xml(segment_id, speed)
//   - 路段清單: static.data.gov.hk/td/traffic-data-strategic-major-roads/info/speed_segments_info.csv(irn_id)
//   - 路段幾何: CSDI「Road Network (2nd Gen)」CENTERLINE(ArcGIS REST,ROUTE_ID = segment_id)
// ⚠️ fail-soft:任何失敗只 log 唔 throw(exit 0),前端見唔到檔案就自動隱藏路況圖。
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import proj4 from 'proj4'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dir, '..', 'public', 'tsm')

const SEGMENTS_CSV =
  'https://static.data.gov.hk/td/traffic-data-strategic-major-roads/info/speed_segments_info.csv'
const LIVE_XML = 'https://resource.data.one.gov.hk/td/traffic-detectors/irnAvgSpeed-all.xml'
// CSDI Road Network (2nd Generation) dataset(ArcGIS Server REST)
const CSDI_SERVICE =
  'https://portal.csdi.gov.hk/server/rest/services/common/td_rcd_1638949160594_2844/MapServer'
const BATCH = 80 // 每次 query 幾多個 id

// EPSG:2326(HK1980)→ WGS84(CSDI 幾何萬一唔係 4326 都轉到)
const HK80 =
  '+proj=tmerc +lat_0=22.31213333333334 +lon_0=114.1785555555556 +k=1 ' +
  '+x_0=836694.05 +y_0=819069.8 +ellps=intl ' +
  '+towgs84=-162.619,-276.959,-161.764,0.067753,-2.24365,-1.15883,-1.09425 +units=m +no_defs'
const toWgs = proj4(HK80, proj4.WGS84)

async function get(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(60000),
    headers: { 'User-Agent': 'kkcx-build/1.0' },
  })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.text()
}

const round5 = (v) => Number(v.toFixed(5))

/** [x,y](HK1980 或 lng/lat)→ [lat,lng];唔喺香港範圍回 null */
function toLatLng(x, y) {
  let lat
  let lng
  if (Math.abs(x) > 1000 || Math.abs(y) > 1000) {
    ;[lng, lat] = toWgs.forward([x, y])
  } else {
    lng = x
    lat = y
  }
  if (lat < 22 || lat > 22.7 || lng < 113.7 || lng > 114.5) return null
  return [round5(lat), round5(lng)]
}

function toPath(coords) {
  const path = []
  for (const c of coords) {
    const p = toLatLng(Number(c[0]), Number(c[1]))
    if (!p) return null
    path.push(p)
  }
  return path.length >= 2 ? path : null
}

/** speed_segments_info.csv → irn_id 清單 */
export function segmentIdsFromCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) throw new Error('segments CSV 空')
  const header = lines[0].split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
  const idCol = header.findIndex((h) => /irn.?_?id|segment.?_?id/i.test(h))
  if (idCol < 0) throw new Error(`segments CSV 冇 irn_id 欄(header: ${header.join('|')})`)
  const ids = []
  for (let i = 1; i < lines.length; i++) {
    const id = lines[i].split(',')[idCol]?.trim().replace(/^"|"$/g, '')
    if (id) ids.push(id)
  }
  return [...new Set(ids)]
}

/** 由 ArcGIS REST 服務揀出 CENTERLINE layer + ROUTE_ID 欄名 */
async function findLayer() {
  const svc = JSON.parse(await get(`${CSDI_SERVICE}?f=pjson`))
  const layers = svc?.layers ?? []
  console.log(`CSDI 服務 layers(${layers.length}):`, layers.map((l) => `${l.id}:${l.name}`).join(', '))
  // 優先名叫 CENTERLINE 嘅,否則逐個試
  const order = [
    ...layers.filter((l) => /centre?line/i.test(l.name)),
    ...layers.filter((l) => !/centre?line/i.test(l.name)),
  ]
  for (const l of order) {
    try {
      const info = JSON.parse(await get(`${CSDI_SERVICE}/${l.id}?f=pjson`))
      const fields = (info?.fields ?? []).map((f) => f.name)
      const idField = fields.find((f) => /^route.?_?id$/i.test(f))
      console.log(` layer ${l.id} ${l.name} geometry=${info?.geometryType} fields=${fields.slice(0, 12).join(',')}`)
      if (idField && /Polyline/i.test(info?.geometryType ?? '')) {
        return { layerId: l.id, idField }
      }
    } catch (e) {
      console.log(` layer ${l.id} 讀取失敗:${e.message}`)
    }
  }
  throw new Error('搵唔到有 ROUTE_ID 嘅 Polyline layer')
}

/** 批量 query 幾何(f=geojson,outSR=4326) */
async function queryGeometries(ids, layerId, idField) {
  const links = {}
  let matched = 0
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH)
    // ROUTE_ID 可能係數字/文字 —— 試 raw,唔得就加引號
    const mk = (quoted) =>
      `${CSDI_SERVICE}/${layerId}/query?where=${encodeURIComponent(
        `${idField} IN (${batch.map((v) => (quoted ? `'${v}'` : v)).join(',')})`,
      )}&outFields=${idField}&returnGeometry=true&outSR=4326&f=geojson`
    let gj = null
    for (const quoted of [false, true]) {
      try {
        const j = JSON.parse(await get(mk(quoted)))
        if (j?.features) {
          gj = j
          break
        }
        if (j?.error) throw new Error(JSON.stringify(j.error).slice(0, 160))
      } catch (e) {
        if (quoted) console.log(`  batch ${i / BATCH} 失敗:${e.message}`)
      }
    }
    if (!gj) continue
    for (const f of gj.features) {
      const id = String(f?.properties?.[idField] ?? f?.properties?.[idField.toLowerCase()] ?? '').trim()
      if (!id) continue
      const g = f.geometry
      let coords = null
      if (g?.type === 'LineString') coords = g.coordinates
      else if (g?.type === 'MultiLineString') coords = g.coordinates.flat()
      if (!coords?.length) continue
      const path = toPath(coords)
      if (!path) continue
      links[id] = path
      matched++
    }
    if (i % (BATCH * 5) === 0) console.log(`  進度 ${Math.min(i + BATCH, ids.length)}/${ids.length},已對到 ${matched}`)
  }
  return links
}

async function main() {
  try {
    const ids = segmentIdsFromCsv(await get(SEGMENTS_CSV))
    console.log(`路段清單:${ids.length} 個 irn_id(樣本:${ids.slice(0, 5).join(', ')})`)
    const { layerId, idField } = await findLayer()
    console.log(`用 layer ${layerId},id 欄 ${idField}`)
    const links = await queryGeometries(ids, layerId, idField)
    const n = Object.keys(links).length
    if (n < 50) throw new Error(`只對到 ${n} 條 segment 幾何`)
    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(join(OUT_DIR, 'links.json'), JSON.stringify(links))
    writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify({ live: LIVE_XML }))
    console.log(`✓ 寫入 public/tsm/links.json(${n} 條)+ meta.json(live=${LIVE_XML})`)
  } catch (e) {
    console.log(`✗ ${e.message}`)
    console.log('跳過(前端會自動隱藏路況圖,不影響部署)')
  }
}

// import 唔會自動跑(方便單元測試)
if (process.argv[1] && /fetch-tsm\.mjs$/.test(process.argv[1])) await main()
