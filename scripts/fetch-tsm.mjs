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

// CSDI WAF 對非瀏覽器 UA 嘅 /query 會 403 —— 扮瀏覽器 + 帶 Referer
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'application/json,*/*',
  Referer: 'https://portal.csdi.gov.hk/',
}

async function get(url, browserish = false) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(60000),
    headers: browserish ? BROWSER_HEADERS : { 'User-Agent': 'kkcx-build/1.0' },
  })
  if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 120)}`)
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

/** GeoJSON / esriJSON feature → [id, path] */
function featureToLink(f, idField) {
  const props = f?.properties ?? f?.attributes ?? {}
  const id = String(props[idField] ?? props[idField.toLowerCase()] ?? props[idField.toUpperCase()] ?? '').trim()
  if (!id) return null
  const g = f?.geometry
  let coords = null
  if (g?.type === 'LineString') coords = g.coordinates
  else if (g?.type === 'MultiLineString') coords = g.coordinates.flat()
  else if (g?.paths?.length) coords = g.paths.flat() // esriJSON polyline
  if (!coords?.length) return null
  const path = toPath(coords)
  return path ? [id, path] : null
}

/** 批量 query 幾何(f=geojson → f=json 後備,扮瀏覽器 headers) */
async function queryGeometries(serviceUrl, ids, layerId, idField) {
  const links = {}
  let matched = 0
  let hardFail = 0
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH)
    const mk = (fmt, quoted) =>
      `${serviceUrl}/${layerId}/query?where=${encodeURIComponent(
        `${idField} IN (${batch.map((v) => (quoted ? `'${v}'` : v)).join(',')})`,
      )}&outFields=${idField}&returnGeometry=true&outSR=4326&f=${fmt}`
    let feats = null
    let lastErr = ''
    for (const [fmt, quoted] of [['geojson', false], ['json', false], ['json', true]]) {
      try {
        const j = JSON.parse(await get(mk(fmt, quoted), true))
        if (j?.error) throw new Error(JSON.stringify(j.error).slice(0, 160))
        if (j?.features) {
          feats = j.features
          break
        }
      } catch (e) {
        lastErr = e.message
      }
    }
    if (!feats) {
      hardFail++
      if (hardFail <= 2) console.log(`  batch ${i / BATCH} 失敗:${lastErr}`)
      if (hardFail >= 3 && matched === 0) throw new Error(`query 連續失敗(${lastErr})`)
      continue
    }
    for (const f of feats) {
      const r = featureToLink(f, idField)
      if (!r) continue
      links[r[0]] = r[1]
      matched++
    }
    if (i % (BATCH * 10) === 0) console.log(`  進度 ${Math.min(i + BATCH, ids.length)}/${ids.length},已對到 ${matched}`)
  }
  return links
}

/** 後備:esrichina ArcGIS Hub 嘅香港道路網鏡像(FeatureServer 開放 query) */
async function esriHubFallback(ids) {
  const HUB = 'https://opendata.arcgis.com/api/v3/datasets/188a2dfc78bd44d19fa99edfe87b20e7'
  const meta = JSON.parse(await get(HUB, true))
  const url = meta?.data?.attributes?.url ?? meta?.data?.attributes?.serviceUrl
  if (!url) throw new Error('Hub metadata 冇 service url')
  console.log(`Hub 服務:${url}`)
  const base = url.replace(/\/(\d+)\/?$/, '')
  const layerId = /\/(\d+)\/?$/.exec(url)?.[1] ?? '0'
  // 攞 layer fields 搵 ROUTE_ID
  const info = JSON.parse(await get(`${base}/${layerId}?f=pjson`, true))
  const idField = (info?.fields ?? []).map((f) => f.name).find((n) => /^route.?_?id$/i.test(n))
  if (!idField) throw new Error(`Hub layer 冇 ROUTE_ID(fields: ${(info?.fields ?? []).map((f) => f.name).slice(0, 10).join(',')})`)
  return queryGeometries(base, ids, layerId, idField)
}

async function main() {
  try {
    const ids = segmentIdsFromCsv(await get(SEGMENTS_CSV))
    console.log(`路段清單:${ids.length} 個 irn_id(樣本:${ids.slice(0, 5).join(', ')})`)
    let links = null
    // 1) CSDI 官方
    try {
      const { layerId, idField } = await findLayer()
      console.log(`用 CSDI layer ${layerId},id 欄 ${idField}`)
      links = await queryGeometries(CSDI_SERVICE, ids, layerId, idField)
    } catch (e) {
      console.log(`CSDI 失敗:${e.message}`)
    }
    // 2) esrichina Hub 鏡像後備
    if (!links || Object.keys(links).length < 50) {
      console.log('轉用 ArcGIS Hub 鏡像…')
      links = await esriHubFallback(ids)
    }
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
