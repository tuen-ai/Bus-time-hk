// 診斷工具:檢查地圖底圖供應商通唔通(開發沙盒封鎖 *.gov.hk,要喺 GitHub Actions 跑)。
// Actions → Probe live APIs → 剔「tiles」→ Run workflow。
//
//   node scripts/probe-tiles.mjs          # 各供應商 / 各 zoom 嘅 HTTP 狀態、類型、大小
//   node scripts/probe-tiles.mjs --dump   # 再印旺角 z16 圖塊 base64,人手還原睇下張圖啱唔啱
import { createHash } from 'node:crypto'

const DUMP = process.argv.includes('--dump')
const MK = { lat: 22.3193, lng: 114.1694 } // 旺角
const tileX = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z)
const tileY = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

const LANDSD = 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz'
const SOURCES = [
  ['地政總署 底圖 WGS84', (z, x, y) => `${LANDSD}/basemap/WGS84/${z}/${x}/${y}.png`],
  ['地政總署 底圖 wgs84', (z, x, y) => `${LANDSD}/basemap/wgs84/${z}/${x}/${y}.png`],
  ['地政總署 中文標籤 WGS84', (z, x, y) => `${LANDSD}/label/hk/tc/WGS84/${z}/${x}/${y}.png`],
  ['地政總署 中文標籤 wgs84', (z, x, y) => `${LANDSD}/label/hk/tc/wgs84/${z}/${x}/${y}.png`],
  [
    'CARTO voyager(免 key)',
    (z, x, y) => `https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
  ],
  ['OSM', (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`],
]
const ZOOMS = [8, 10, 12, 14, 16, 17, 18, 19, 20]

async function probe(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'kkcx-probe/1.0 (+https://tuen-ai.github.io/Bus-time-hk/)' },
    })
    const buf = Buffer.from(await res.arrayBuffer())
    const h = (k) => res.headers.get(k) ?? '-'
    return {
      ok: res.ok,
      buf,
      text:
        `${res.status} ${h('content-type')} ${buf.length}B sha1:${createHash('sha1').update(buf).digest('hex').slice(0, 8)}` +
        ` cors:${h('access-control-allow-origin')} cache:${h('cache-control')}`,
    }
  } catch (e) {
    return { ok: false, buf: null, text: `ERR ${e.message}` }
  }
}

for (const [name, url] of SOURCES) {
  console.log(`\n== ${name}`)
  for (const z of ZOOMS) {
    const r = await probe(url(z, tileX(MK.lng, z), tileY(MK.lat, z)))
    console.log(`  z${z}: ${r.text}`)
  }
  // 海中心(冇地物)嘅圖塊:睇下會唔會係同一張「空白」圖
  const r = await probe(url(16, tileX(114.05, 16), tileY(22.18, 16)))
  console.log(`  z16 海面: ${r.text}`)
}

console.log('\n== 歸屬 / logo')
for (const u of [
  'https://api.hkmapservice.gov.hk/mapapi/landsdlogo.jpg',
  'https://api.portal.hkmapservice.gov.hk/disclaimer',
]) {
  console.log(`  ${u}\n    ${(await probe(u)).text}`)
}

if (DUMP) {
  const z = 16
  // 底圖、標籤各印一張(WGS84 / wgs84 邊個通就用邊個)
  for (const pair of [SOURCES.slice(0, 2), SOURCES.slice(2, 4)]) {
    for (const [name, url] of pair) {
      const r = await probe(url(z, tileX(MK.lng, z), tileY(MK.lat, z)))
      if (!r.ok || !r.buf) continue
      console.log(`\n== DUMP ${name} z${z} ${r.buf.length}B`)
      console.log('-----BEGIN TILE-----')
      console.log(r.buf.toString('base64').replace(/(.{100})/g, '$1\n'))
      console.log('-----END TILE-----')
      break
    }
  }
}
