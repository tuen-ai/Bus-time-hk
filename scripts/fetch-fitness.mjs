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

// ---- Blog 分店清單 + geocode(官方抓唔到時用)----
const BLOG_URLS = [
  'https://www.hongkongcard.com/blogs/247fitness-hk-shop-list',
  'https://gymbeastics.com/24-7-fitness/',
]

const stripTags = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')

// 香港地址:含 道/街/路/廣場… + 號/樓/地下/G/F
const ADDR_RE =
  /([^,，。;；\n]{0,26}?(?:道|街|路|徑|廣場|中心|大廈|商場|工業|坊|里|花園|邨|苑)[^,，。;；\n]{0,34}?(?:\d+[-–\d]*\s*號|地下|地庫|[1-9]\d?\s*[樓層]|[GＧ1-9]\s*\/\s*[FＦ]|[舖鋪]\d))/

/** 由 blog table / 純文字行抽 { name, addr } */
function parseBlogEntries(html) {
  const out = []
  const seen = new Set()
  const add = (name, addr) => {
    addr = addr.trim().replace(/\s+/g, ' ')
    if (!addr || seen.has(addr)) return
    seen.add(addr)
    out.push({ name: (name || '24/7 Fitness').trim().replace(/\s+/g, ' ').slice(0, 40), addr })
  }
  // 1) table rows
  for (const tr of html.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripTags(m[1]).trim())
    if (cells.length < 2) continue
    const addrCell = cells.find((c) => ADDR_RE.test(c))
    if (!addrCell) continue
    const nameCell = cells.find((c) => c !== addrCell && /店|分店|24\s*\/\s*7|Fitness/i.test(c))
    add(nameCell || cells[0], (ADDR_RE.exec(addrCell) || [addrCell])[0])
  }
  // 2) 純文字行兜底
  if (out.length < 10) {
    const text = stripTags(html)
    for (const m of text.matchAll(new RegExp(ADDR_RE.source, 'g'))) {
      const addr = m[1]
      const before = text.slice(Math.max(0, m.index - 40), m.index)
      const nameM = /([一-鿿A-Za-z0-9]{2,20}?(?:店|分店))\s*$/.exec(before)
      add(nameM ? nameM[1] : '24/7 Fitness', addr)
    }
  }
  return out
}

let alsDebugged = false
async function geocodeAls(q) {
  for (const host of ['https://www.als.gov.hk', 'https://www.als.ogcio.gov.hk']) {
    try {
      const res = await fetch(`${host}/lookup?q=${encodeURIComponent(q)}&n=1`, {
        headers: { Accept: 'application/json', 'Accept-Language': 'zh-Hant,en' },
        signal: AbortSignal.timeout(12000),
      })
      if (!res.ok) {
        if (!alsDebugged) {
          alsDebugged = true
          console.log(`  [debug] ALS ${host} → HTTP ${res.status}`)
        }
        throw new Error(String(res.status))
      }
      const body = await res.text()
      if (!alsDebugged) {
        alsDebugged = true
        console.log(`  [debug] ALS ${host} 回應頭:${body.slice(0, 200).replace(/\s+/g, ' ')}`)
      }
      const j = JSON.parse(body)
      let gi = j?.SuggestedAddress?.[0]?.Address?.PremisesAddress?.GeospatialInformation
      if (Array.isArray(gi)) gi = gi[0] // ALS 有時係 object 有時 array
      const lat = Number(gi?.Latitude)
      const lng = Number(gi?.Longitude)
      if (inHK(lat, lng)) return { lat, lng }
      return null
    } catch {
      /* 試下一個 host */
    }
  }
  return null
}

// Nominatim(OSM 官方 geocoder,香港中文地址覆蓋較好)。須 UA + ≤1 req/s。
let nomiDebugged = false
async function geocodeNominatim(q) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ' 香港')}&format=json&limit=1&countrycodes=hk&accept-language=zh-HK`,
      { headers: { 'User-Agent': 'kkcx-build/1.0 (HK transit app; poi geocode)' }, signal: AbortSignal.timeout(15000) },
    )
    if (!res.ok) {
      if (!nomiDebugged) { nomiDebugged = true; console.log(`  [debug] Nominatim → HTTP ${res.status}`) }
      return null
    }
    const arr = await res.json()
    const f = arr?.[0]
    if (f && inHK(Number(f.lat), Number(f.lon))) return { lat: Number(f.lat), lng: Number(f.lon) }
  } catch {
    /* ignore */
  }
  return null
}

async function geocodePhoton(q) {
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&bbox=113.83,22.15,114.45,22.58`,
      { signal: AbortSignal.timeout(12000) },
    )
    if (!res.ok) return null
    const j = await res.json()
    const c = j?.features?.[0]?.geometry?.coordinates
    if (c && inHK(Number(c[1]), Number(c[0]))) return { lat: Number(c[1]), lng: Number(c[0]) }
  } catch {
    /* ignore */
  }
  return null
}

async function fetchBlog() {
  const entries = []
  const seen = new Set()
  for (const url of BLOG_URLS) {
    try {
      console.log(`blog:嘗試 ${url}`)
      const html = await getText(url)
      const es = parseBlogEntries(html)
      console.log(`  抽到 ${es.length} 條地址`)
      for (const e of es) {
        if (seen.has(e.addr)) continue
        seen.add(e.addr)
        entries.push(e)
      }
    } catch (e) {
      console.log(`  ✗ ${e.message}`)
    }
  }
  if (!entries.length) return []
  console.log(`合共 ${entries.length} 條唯一地址,開始 geocode…`)
  const out = []
  const stat = { als: 0, nomi: 0, photon: 0 }
  for (let i = 0; i < entries.length && i < 200; i++) {
    const e = entries[i]
    let usedSlow = false
    let g = await geocodeAls(e.addr) // ALS 官方最準,無 rate limit
    if (g) stat.als++
    if (!g) { usedSlow = true; g = await geocodeNominatim(e.addr); if (g) stat.nomi++ }
    if (!g) { usedSlow = true; g = await geocodePhoton(e.addr); if (g) stat.photon++ }
    if (g) out.push({ n: e.name, addr: e.addr, lat: g.lat, lng: g.lng })
    await new Promise((r) => setTimeout(r, usedSlow ? 1100 : 200)) // 用到 Nominatim 先守 1 req/s
  }
  console.log(`geocode 成功 ${out.length}/${Math.min(entries.length, 200)}(ALS ${stat.als} · Nominatim ${stat.nomi} · Photon ${stat.photon})`)
  return out
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

// 香港常見地區(由地址抽,做分店標籤令清單分得清)
const AREAS = [
  '上水', '粉嶺', '大埔', '太和', '大圍', '沙田', '馬鞍山', '火炭', '烏溪沙',
  '荃灣', '葵芳', '葵涌', '青衣', '屯門', '元朗', '天水圍', '洪水橋',
  '將軍澳', '坑口', '調景嶺', '西貢', '觀塘', '牛頭角', '九龍灣', '藍田', '油塘',
  '黃大仙', '鑽石山', '慈雲山', '樂富', '九龍城', '土瓜灣', '紅磡', '何文田',
  '深水埗', '長沙灣', '美孚', '荔枝角', '石硤尾', '又一城',
  '旺角', '太子', '油麻地', '佐敦', '尖沙咀', '奧運', '大角咀',
  '中環', '上環', '西環', '堅尼地城', '金鐘', '灣仔', '銅鑼灣', '天后', '炮台山',
  '北角', '鰂魚涌', '太古', '西灣河', '筲箕灣', '杏花邨', '柴灣', '小西灣',
  '香港仔', '鴨脷洲', '黃竹坑', '東涌',
]
const areaOf = (addr) => AREAS.find((a) => addr.includes(a))

function normalise(raw) {
  const seen = new Set()
  const out = []
  for (const r of raw) {
    if (!isFinite(r.lat) || !isFinite(r.lng) || !inHK(r.lat, r.lng)) continue
    const key = `${Math.round(r.lat * 3000)}:${Math.round(r.lng * 3000)}` // ~35m 去重
    if (seen.has(key)) continue
    seen.add(key)
    const addr = (r.addr || '').replace(/\s+/g, ' ').trim()
    let name = (r.n || '').replace(/\s+/g, ' ').trim()
    // 分店名 generic → 用地區標籤(例:24/7 Fitness · 旺角)
    if (!name || /^24\s*\/\s*7 ?fitness$/i.test(name)) {
      const area = areaOf(addr)
      name = area ? `24/7 Fitness · ${area}` : '24/7 Fitness'
    }
    out.push({ n: name, en: '', lat: Number(r.lat.toFixed(5)), lng: Number(r.lng.toFixed(5)), addr })
  }
  return out
}

async function main() {
  // 1) 官方 SSR(最理想,但 Next 動態載入多數抓唔到)
  let raw = (await fetchOfficial()) ?? []
  const src = []
  if (raw.length >= 20) src.push('官方')
  // 2) blog 地址 + geocode(主力齊全來源)
  if (raw.length < 20) {
    const blog = await fetchBlog()
    if (blog.length) {
      raw = raw.concat(blog)
      src.push('blog+geocode')
    }
  }
  // 3) OSM 保底(補漏 + 座標最準)
  const osm = await fetchOsm()
  if (osm.length) {
    raw = raw.concat(osm)
    src.push('OSM')
  }
  const out = normalise(raw)
  const source = src.join('+') || '無'
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
