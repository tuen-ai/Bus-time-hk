// Build-time:由 OpenStreetMap(Overpass API)抓 24/7 Fitness 香港分店
//   → public/fitness.json  [{ n, en, lat, lng, addr }]
// 資料 © OpenStreetMap contributors(ODbL)。fail-soft:失敗唔阻部署。
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dir, '..', 'public', 'fitness.json')

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

// 名/品牌有 24/7 兼似健身房。用 bbox(唔用 area —— 部分 mirror 解唔到 area)
const BBOX = '22.15,113.83,22.58,114.45' // 香港
const QUERY = `
[out:json][timeout:50];
(
  nwr["leisure"="fitness_centre"]["name"~"24/7",i](${BBOX});
  nwr["leisure"="fitness_centre"]["brand"~"24/7",i](${BBOX});
  nwr["name"~"24/7 ?Fitness",i](${BBOX});
  nwr["brand"~"24/7 ?Fitness",i](${BBOX});
);
out center tags;
`

async function tryMirror(url) {
  // 504/429 屬過載,隔 10 秒多試一次
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 10000))
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({ data: QUERY }),
        headers: { 'User-Agent': 'kkcx-build/1.0 (transit app poi bake)' },
        signal: AbortSignal.timeout(70000),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const j = await res.json()
      console.log(`  raw elements: ${(j.elements ?? []).length}`)
      if (!(j.elements ?? []).length) throw new Error('0 elements')
      return j
    } catch (e) {
      if (attempt) throw e
      console.log(`  retry(${e.message})…`)
    }
  }
}

async function main() {
  let data = null
  for (const m of MIRRORS) {
    try {
      console.log(`嘗試 ${m}`)
      data = await tryMirror(m)
      break
    } catch (e) {
      console.log(`  ✗ ${e.message}`)
    }
  }
  if (!data) {
    console.log('全部 mirror 失敗 —— 跳過(前端自動隱藏健身房地圖)')
    return
  }
  const seen = new Set()
  const out = []
  for (const el of data.elements ?? []) {
    const t = el.tags ?? {}
    const name = t['name:zh'] || t['name:zh-Hant'] || t.name || ''
    if (!name) continue
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (!lat || !lng) continue
    // 去重(同一分店 node+way 都出現)
    const key = `${Math.round(lat * 5000)}:${Math.round(lng * 5000)}`
    if (seen.has(key)) continue
    seen.add(key)
    const addrParts = [t['addr:street'], t['addr:housenumber'], t['addr:city']].filter(Boolean)
    out.push({
      n: name,
      en: t['name:en'] || t.name || '',
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      addr: t['addr:full:zh'] || t['addr:full'] || addrParts.join(' ') || '',
    })
  }
  console.log(`搵到 ${out.length} 間分店`)
  for (const o of out.slice(0, 5)) console.log(` - ${o.n} @ ${o.lat},${o.lng}`)
  if (out.length < 3) {
    console.log('少過 3 間,似乎唔啱 —— 跳過')
    return
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(out))
  console.log(`✓ 寫入 public/fitness.json`)
}

if (process.argv[1] && /fetch-fitness\.mjs$/.test(process.argv[1])) await main()
