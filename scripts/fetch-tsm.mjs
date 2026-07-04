// Build-time:砌「主要道路實時車速」路段幾何 → public/tsm/
//   links.json  { "<segment_id>": [[lat,lng],...], ... }
//   meta.json   { live: <實時 XML URL> }
// 資料模型(2nd gen):
//   - 實時車速: resource.data.one.gov.hk/td/traffic-detectors/irnAvgSpeed-all.xml(segment_id, speed)
//   - 路段清單: static.data.gov.hk/td/traffic-data-strategic-major-roads/info/speed_segments_info.csv(irn_id)
//   - 路段幾何: CSDI「Road Network (2nd Gen)」CENTERLINE(ArcGIS REST,ROUTE_ID = segment_id)
// ⚠️ fail-soft:任何失敗只 log 唔 throw(exit 0),前端見唔到檔案就自動隱藏路況圖。
import { createWriteStream, createReadStream, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
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
  // 網絡級 fetch failed 好常見 —— 重試 3 次,退避 2s/4s
  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, attempt * 2000))
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(60000),
        headers: browserish ? BROWSER_HEADERS : { 'User-Agent': 'kkcx-build/1.0' },
      })
      if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 120)}`)
      return res.text()
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
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
    ...layers.filter((l) => /cent(?:er|re)line/i.test(l.name)),
    ...layers.filter((l) => !/cent(?:er|re)line/i.test(l.name)),
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

// ---- 後備:Road Network (2nd Gen) GML/KML 靜態包(static.data.gov.hk,無 WAF)----

/** CKAN 搵 Road Network v2 嘅 GML/KML zip URL */
// CKAN 清單(run 28605013296)已證實存在嘅直接 URL —— CKAN 掛咗都照跑
const CENTERLINE_GML = 'https://static.data.gov.hk/td/road-network-v2/CENTERLINE.gml'

async function findRoadNetZip() {
  let j
  try {
    j = JSON.parse(
      await get('https://data.gov.hk/en-data/api/3/action/package_show?id=hk-td-tis_15-road-network-v2'),
    )
  } catch (e) {
    console.log(`CKAN 失敗(${e.message}),用已知 CENTERLINE.gml URL`)
    return CENTERLINE_GML
  }
  const rs = j?.result?.resources ?? []
  console.log(`CKAN road-network-v2 resources(${rs.length}):`)
  for (const r of rs) console.log(` - [${r.format}] ${r.name ?? ''} ${r.url}`)
  // 只要 CENTERLINE(路中心線)—— 優先 GML(純文字免解壓),其次 KML/KMZ
  const pick =
    rs.find((r) => /cent(?:er|re)line/i.test(`${r.name} ${r.url}`) && /\.gml/i.test(r.url)) ??
    rs.find((r) => /cent(?:er|re)line/i.test(`${r.name} ${r.url}`) && /kml|kmz/i.test(`${r.format} ${r.url}`)) ??
    rs.find((r) => /gml/i.test(`${r.format} ${r.url}`))
  if (!pick) {
    console.log('CKAN 清單搵唔到 CENTERLINE,用已知 URL')
    return CENTERLINE_GML
  }
  console.log(`揀咗:${pick.url}`)
  return pick.url
}

async function download(url, dest) {
  const res = await fetch(url, { signal: AbortSignal.timeout(600000), headers: { 'User-Agent': 'kkcx-build/1.0' } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(dest)
    Readable.fromWeb(res.body).pipe(ws).on('finish', resolve).on('error', reject)
  })
  console.log(`  已下載 ${(statSync(dest).size / 1048576).toFixed(1)}MB`)
}

function walkFiles(dir) {
  const out = []
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name)
    if (f.isDirectory()) out.push(...walkFiles(p))
    else out.push(p)
  }
  return out
}

/**
 * Stream 過濾大型 GML/KML:逐 feature 塊收集 ROUTE_ID + raw 座標(未轉軸)。
 * GML posList(HK1980)軸序可能係 E,N 或官方 N,E —— E/N 數值範圍重疊,
 * 單一 feature 判斷唔到,所以先收集晒,再由 finalizeLinks 全體投票決定。
 * GML2 <coordinates> 規範係 x,y(E,N);KML <coordinates> 係 lng,lat —— 冇歧義。
 */
/** posList 數字 → pairs(自動偵測 2D/3D:冇 srsDimension 時用 z 值細 + 每 3 個一組判斷) */
function numsToPairs(nums, explicitDim) {
  let dim = explicitDim ?? 2
  if (!explicitDim && nums.length % 3 === 0 && nums.length >= 6) {
    const zLike = nums.every((v, i) => i % 3 !== 2 || Math.abs(v) < 10000)
    const xyLike = nums.every((v, i) => i % 3 === 2 || Math.abs(v) > 100000)
    if (zLike && xyLike) dim = 3
  }
  const pairs = []
  for (let i = 0; i + 1 < nums.length; i += dim) pairs.push([nums[i], nums[i + 1]])
  return pairs
}

export function extractFromMarkup(buffer, wanted, raw) {
  // 以 feature 結尾 tag 分塊:featureMember / member / Placemark /
  // cityObjectMember(CityGML)/ <XXX:CENTERLINE>(esri featureMembers 複數式)
  const parts = buffer.split(
    /<\/(?:gml:featureMember|wfs:member|member|Placemark|(?:\w+:)?cityObjectMember|(?:\w+:)?\w*CENTERLINE\w*)>/i,
  )
  const rest = parts.pop() ?? ''
  for (const block of parts) {
    // 兩款:<td:ROUTE_ID>275< 或 CityGML <gen:intAttribute name="ROUTE_ID"><gen:value>275<
    const idm = /ROUTE_ID[^>]*>\s*(?:<(?:\w+:)?value[^>]*>\s*)?(\d+)\s*</i.exec(block)
    if (!idm || !wanted.has(idm[1])) continue
    const pos = /<[^>]*posList([^>]*)>([\d\s.eE+-]+)</.exec(block)
    if (pos) {
      const explicit = /srsDimension\s*=\s*"?(\d)/.exec(pos[1])?.[1]
      const nums = pos[2].trim().split(/\s+/).map(Number)
      const pairs = numsToPairs(nums, explicit ? Number(explicit) : undefined)
      if (pairs.length >= 2) raw.set(idm[1], { pairs, posList: true })
      continue
    }
    // CityGML LineString 有時逐點 <gml:pos>x y z</gml:pos>
    const posPts = [...block.matchAll(/<(?:\w+:)?pos(?:\s[^>]*)?>([\d\s.eE+-]+)</g)]
    if (posPts.length >= 2) {
      const pairs = posPts.map((m) => m[1].trim().split(/\s+/).slice(0, 2).map(Number))
      raw.set(idm[1], { pairs, posList: true })
      continue
    }
    const co = /<[^>]*coordinates[^>]*>([\d\s.,eE+-]+)</.exec(block)
    if (co) {
      const pairs = co[1].trim().split(/\s+/).map((p) => p.split(',').slice(0, 2).map(Number))
      if (pairs.length >= 2) raw.set(idm[1], { pairs, posList: false })
    }
  }
  return rest
}

/** 決定 posList 軸序,再轉晒做 [[lat,lng],...]
 *  規則1(決定性):HK1980 E 最大 ~869k(西貢以東),N 最大 ~847k ——
 *  邊列有 >852k 嘅值邊列就係 E。規則2(後備):in-bounds 投票。 */
export function finalizeLinks(raw) {
  let xy = 0
  let yx = 0
  let maxA = -Infinity
  let maxB = -Infinity
  let minA = Infinity
  let minB = Infinity
  for (const { pairs, posList } of raw.values()) {
    if (!posList) continue
    for (const [a, b] of pairs) {
      if (a > maxA) maxA = a
      if (b > maxB) maxB = b
      if (a < minA) minA = a
      if (b < minB) minB = b
    }
    const [a, b] = pairs[0]
    if (toLatLng(a, b)) xy++
    if (toLatLng(b, a)) yx++
  }
  let swap
  if (maxA > 852000 && maxB <= 852000) swap = false // E 極值(>852k 只可能係 E)
  else if (maxB > 852000 && maxA <= 852000) swap = true
  // N 下限:香港陸上道路 N ≥ ~805k(再南係公海),E 可以低到 ~801k(港珠澳橋西端)
  else if (minA < 805000 && minB >= 805000) swap = false // 第一列有 <805k → 係 E
  else if (minB < 805000 && minA >= 805000) swap = true
  else swap = yx > xy // 後備:投票
  if (xy || yx) {
    console.log(
      `  [axis] 列A範圍 ${Math.round(minA)}–${Math.round(maxA)},列B範圍 ${Math.round(minB)}–${Math.round(maxB)};` +
        `投票 E,N=${xy} N,E=${yx} → 用 ${swap ? 'N,E(對調)' : 'E,N'}`,
    )
  }
  const links = {}
  for (const [id, { pairs, posList }] of raw) {
    const coords = posList && swap ? pairs.map(([a, b]) => [b, a]) : pairs
    const path = toPath(coords)
    if (path) links[id] = path
  }
  return links
}

async function roadNetFallback(idList) {
  const wanted = new Set(idList)
  const url = await findRoadNetZip()
  const tmp = join(tmpdir(), 'roadnet')
  mkdirSync(tmp, { recursive: true })
  // .gml 係純文字直接用;.zip/.kmz 先至解壓
  const isZip = /\.(zip|kmz)(\?|$)/i.test(url)
  const dest = join(tmp, isZip ? 'roadnet.zip' : 'roadnet.gml')
  console.log(`下載 ${url} …`)
  await download(url, dest)
  let files
  if (isZip) {
    const un = spawnSync('unzip', ['-o', '-q', dest, '-d', tmp], { stdio: 'inherit' })
    if (un.status !== 0) throw new Error('unzip 失敗')
    files = walkFiles(tmp).filter((f) => /\.(gml|kml|xml)$/i.test(f) && !/\.zip$/i.test(f))
  } else {
    files = [dest]
  }
  console.log(`待解析:${files.map((f) => `${f.split('/').pop()}(${(statSync(f).size / 1048576).toFixed(0)}MB)`).join(', ')}`)
  // 優先包含 CENTERLINE 字眼嘅檔
  files.sort((a, b) => (/cent(?:er|re)line/i.test(b) ? 1 : 0) - (/cent(?:er|re)line/i.test(a) ? 1 : 0))
  const raw = new Map() // id → { pairs, posList }(raw 座標,最後先定軸序)
  for (const f of files) {
    let head = '' // 檔案頭 + 第一個 ROUTE_ID 附近樣本(parse 失敗時用嚟診斷)
    let ridSnippet = ''
    await new Promise((resolve, reject) => {
      let buf = ''
      const rs = createReadStream(f, { encoding: 'utf8', highWaterMark: 1 << 20 })
      rs.on('data', (chunk) => {
        buf += chunk
        if (head.length < 2500) head = buf.slice(0, 2500)
        if (!ridSnippet) {
          const at = buf.search(/ROUTE_ID/i)
          if (at >= 0 && buf.length > at + 600) ridSnippet = buf.slice(Math.max(0, at - 400), at + 600)
        }
        if (buf.length > 8 << 20) buf = extractFromMarkup(buf, wanted, raw)
      })
      rs.on('end', () => {
        extractFromMarkup(buf, wanted, raw)
        resolve()
      })
      rs.on('error', reject)
    })
    console.log(`  ${f.split('/').pop()} → 累計對到 ${raw.size}`)
    if (raw.size === 0) {
      // 印真實結構樣本,方便由 CI log 再對症下藥
      console.log(`  [debug] 檔案頭:${head.replace(/\s+/g, ' ').slice(0, 1200)}`)
      console.log(`  [debug] ROUTE_ID 附近:${ridSnippet.replace(/\s+/g, ' ').slice(0, 1000)}`)
    }
    if (raw.size >= wanted.size * 0.5) break // 夠一半就收工
  }
  return finalizeLinks(raw)
}

async function main() {
  try {
    const ids = segmentIdsFromCsv(await get(SEGMENTS_CSV))
    console.log(`路段清單:${ids.length} 個 irn_id(樣本:${ids.slice(0, 5).join(', ')})`)
    // CSDI /query 對 datacenter IP 一律 403(已試瀏覽器 headers)——
    // 直接用 static.data.gov.hk 嘅 Road Network (2nd Gen) GML/KML 包過濾
    const links = await roadNetFallback(ids)
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
