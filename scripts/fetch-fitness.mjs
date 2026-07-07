// Build-time:抓 24/7 Fitness 香港分店 → public/fitness.json  [{ n, en, lat, lng, addr }]
// 主來源:官方站(全港 130+ 間);後備:OpenStreetMap Overpass(© OSM contributors)。
// 沙盒封鎖外部站,只可靠 GitHub Actions runner 執行 —— 失敗會 dump 結構到 log 供迭代。
// fail-soft:任何失敗只 log 唔 throw,前端見唔到檔案自動隱藏健身房地圖。
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dir, '..', 'public', 'fitness.json')

const BBOX = { latMin: 22.15, latMax: 22.58, lngMin: 113.83, lngMax: 114.45 }
const inHK = (lat, lng) =>
  lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax

const BROWSER = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*',
  'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8',
}

async function getText(url) {
  const res = await fetch(url, { headers: BROWSER, signal: AbortSignal.timeout(45000) })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.text()
}

// ---- 官方站 ----
const OFFICIAL_URLS = [
  'https://247.fitness/zh-hk/contact_us/stores',
  'https://247.fitness/en/contact_us/stores',
  'https://247-fitness.cn/hk/find-us-details/',
]

/** 遞歸行任意 JSON,搵含座標(+名/地址)嘅 object */
function harvestCoords(node, out, depth = 0) {
  if (!node || depth > 12) return
  if (Array.isArray(node)) {
    for (const x of node) harvestCoords(x, out, depth + 1)
    return
  }
  if (typeof node !== 'object') return
  const keys = Object.keys(node)
  const findKey = (re) => keys.find((k) => re.test(k))
  const latK = findKey(/^lat(itude)?$/i)
  const lngK = findKey(/^(lng|lon|longitude)$/i)
  if (latK && lngK) {
    const lat = Number(node[latK])
    const lng = Number(node[lngK])
    if (isFinite(lat) && isFinite(lng) && inHK(lat, lng)) {
      const nameK = findKey(/^(name|title|store|branch|name_zh|name_tc|shop)/i)
      const addrK = findKey(/^(addr|address|location|full_address)/i)
      out.push({
        n: String((nameK && node[nameK]) || '').trim(),
        addr: String((addrK && node[addrK]) || '').trim(),
        lat,
        lng,
      })
    }
  }
  for (const k of keys) harvestCoords(node[k], out, depth + 1)
}

/** 由 HTML 抽 embedded JSON(NEXT_DATA / application-json script / __NUXT__ 等) */
function extractJsonBlobs(html) {
  const blobs = []
  const push = (s) => {
    try {
      blobs.push(JSON.parse(s))
    } catch {
      /* ignore */
    }
  }
  const next = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html)
  if (next) push(next[1])
  for (const m of html.matchAll(/<script[^>]*type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    push(m[1])
  }
  const nuxt = /window\.__NUXT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i.exec(html)
  if (nuxt) push(nuxt[1])
  return blobs
}

/** Next.js App Router flight chunks(self.__next_f.push([n,"...escaped json..."]))
 *  拼埋 decode 返完整 RSC 文字 */
function decodeNextFlight(html) {
  let big = ''
  for (const m of html.matchAll(/self\.__next_f\.push\(\[\d+,\s*("(?:[^"\\]|\\.)*")\s*\]\)/g)) {
    try {
      big += JSON.parse(m[1])
    } catch {
      /* ignore chunk */
    }
  }
  return big
}

/** 由 decode 文字用「座標錨 + 就近 name/address」抽分店 */
function harvestFromText(text, out) {
  // name 喺前
  const pats = [
    /"(?:name|title|store_name|branch|shop_name)"\s*:\s*"([^"]{2,70})"[\s\S]{0,400}?"(?:lat|latitude)"\s*:\s*"?(-?2[0-9]\.\d{3,})"?[\s\S]{0,150}?"(?:lng|lon|longitude)"\s*:\s*"?(11[0-9]\.\d{3,})"?/g,
    // 座標喺前,name 喺後
    /"(?:lat|latitude)"\s*:\s*"?(2[0-9]\.\d{3,})"?[\s\S]{0,150}?"(?:lng|lon|longitude)"\s*:\s*"?(11[0-9]\.\d{3,})"?[\s\S]{0,400}?"(?:name|title|store_name|branch|shop_name|address)"\s*:\s*"([^"]{2,70})"/g,
  ]
  const grab = (name, lat, lng, addrHint) => {
    const la = Number(lat)
    const ln = Number(lng)
    if (!inHK(la, ln)) return
    out.push({ n: name || '', addr: addrHint || '', lat: la, lng: ln })
  }
  const n0 = out.length
  for (const m of text.matchAll(pats[0])) grab(m[1], m[2], m[3])
  // pat0 冇結果先試 pat1(避免 name↔座標 交叉錯配)
  if (out.length === n0) for (const m of text.matchAll(pats[1])) grab(m[3], m[1], m[2])
  // 純座標兜底(冇名都要)
  if (!out.length) {
    for (const m of text.matchAll(/"(?:lat|latitude)"\s*:\s*"?(2[0-9]\.\d{3,})"?[\s\S]{0,120}?"(?:lng|lon|longitude)"\s*:\s*"?(11[0-9]\.\d{3,})"?/g)) {
      grab('', m[1], m[2])
    }
  }
}

async function fetchOfficial() {
  for (const url of OFFICIAL_URLS) {
    try {
      console.log(`官方:嘗試 ${url}`)
      const html = await getText(url)
      console.log(`  HTML ${html.length} bytes`)
      const found = []
      // 1) Next.js flight chunks
      const flight = decodeNextFlight(html)
      if (flight) {
        harvestFromText(flight, found)
        try {
          harvestCoords(JSON.parse(flight), found)
        } catch {
          /* not pure json */
        }
      }
      // 2) 傳統 embedded JSON blobs
      const blobs = extractJsonBlobs(html)
      for (const b of blobs) harvestCoords(b, found)
      // 後備:直接由 HTML regex 搵 lat/lng 對
      if (found.length < 5) {
        for (const m of html.matchAll(
          /"?lat(?:itude)?"?\s*[:=]\s*"?(22\.\d{3,})"?[\s\S]{0,80}?"?(?:lng|lon|longitude)"?\s*[:=]\s*"?(114\.\d{3,})"?/gi,
        )) {
          const lat = Number(m[1])
          const lng = Number(m[2])
          if (inHK(lat, lng)) found.push({ n: '', addr: '', lat, lng })
        }
      }
      // 去重
      const seen = new Set()
      const uniq = []
      for (const f of found) {
        const key = `${f.lat.toFixed(4)}:${f.lng.toFixed(4)}`
        if (seen.has(key)) continue
        seen.add(key)
        uniq.push(f)
      }
      console.log(`  抽到座標:${uniq.length} 個`)
      if (uniq.length >= 20) return uniq
      // 官方站(Next 15 App Router)分店 list 由 client 動態載入,SSR HTML 冇座標 —— 略過
    } catch (e) {
      console.log(`  ✗ ${e.message}`)
    }
  }
  return null
}

// ---- OSM 後備 ----
const OSM_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const OSM_QUERY = `
[out:json][timeout:50];
(
  nwr["leisure"="fitness_centre"]["name"~"24/7",i](${BBOX.latMin},${BBOX.lngMin},${BBOX.latMax},${BBOX.lngMax});
  nwr["name"~"24/7 ?Fitness",i](${BBOX.latMin},${BBOX.lngMin},${BBOX.latMax},${BBOX.lngMax});
  nwr["brand"~"24/7 ?Fitness",i](${BBOX.latMin},${BBOX.lngMin},${BBOX.latMax},${BBOX.lngMax});
);
out center tags;
`

async function fetchOsm() {
  for (const url of OSM_MIRRORS) {
    try {
      console.log(`OSM:嘗試 ${url}`)
      const res = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({ data: OSM_QUERY }),
        headers: { 'User-Agent': 'kkcx-build/1.0' },
        signal: AbortSignal.timeout(70000),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const j = await res.json()
      const out = []
      for (const el of j.elements ?? []) {
        const t = el.tags ?? {}
        const lat = el.lat ?? el.center?.lat
        const lng = el.lon ?? el.center?.lon
        if (!lat || !lng) continue
        out.push({
          n: t['name:zh'] || t['name:zh-Hant'] || t.name || '',
          addr: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '),
          lat,
          lng,
        })
      }
      console.log(`  OSM 分店:${out.length}`)
      if (out.length) return out
    } catch (e) {
      console.log(`  ✗ ${e.message}`)
    }
  }
  return []
}

function normalise(raw) {
  const seen = new Set()
  const out = []
  for (const r of raw) {
    if (!isFinite(r.lat) || !isFinite(r.lng) || !inHK(r.lat, r.lng)) continue
    const key = `${Math.round(r.lat * 3000)}:${Math.round(r.lng * 3000)}` // ~35m 去重
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      n: (r.n || '24/7 Fitness').replace(/\s+/g, ' ').trim(),
      en: '',
      lat: Number(r.lat.toFixed(5)),
      lng: Number(r.lng.toFixed(5)),
      addr: (r.addr || '').replace(/\s+/g, ' ').trim(),
    })
  }
  return out
}

async function main() {
  let raw = await fetchOfficial()
  let source = '官方'
  if (!raw || raw.length < 20) {
    console.log('官方唔夠,改用 OSM 後備')
    const osm = await fetchOsm()
    raw = (raw ?? []).concat(osm)
    source = raw.length && osm.length ? '官方+OSM' : 'OSM'
  }
  const out = normalise(raw ?? [])
  console.log(`最終 ${out.length} 間(來源:${source})`)
  for (const o of out.slice(0, 6)) console.log(` - ${o.n || '(無名)'} @ ${o.lat},${o.lng}`)
  if (out.length < 3) {
    console.log('少過 3 間 —— 跳過(前端自動隱藏)')
    return
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(out))
  console.log(`✓ 寫入 public/fitness.json(${out.length} 間)`)
}

if (process.argv[1] && /fetch-fitness\.mjs$/.test(process.argv[1])) await main()
