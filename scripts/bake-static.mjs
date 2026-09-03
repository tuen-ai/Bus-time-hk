// Build-time:由 hkbus/hk-bus-crawling 嘅 routeFareList.min.json 重新焗出 src/data/ 嘅靜態 JSON。
// 原本(2026-06-27/28)係人手焗一次無 script;呢個 script 令佢可以重複再生。
//
//   node scripts/bake-static.mjs            寫入 src/data/*.json
//   node scripts/bake-static.mjs --check    只喺記憶體再生,同 committed 檔比較 diff 統計,唔寫檔
//                                           (任何一個檔會縮細 >20% 就 exit 1,防上游出事)
//   node scripts/bake-static.mjs --from x.json   用本地檔做上游(離線/debug)
//   node scripts/bake-static.mjs --only kmbGtfs,ctbGtfs   只處理指定檔
//   node scripts/bake-static.mjs --out /tmp/x     寫落其他 folder(dry-run;比較仍然係對 src/data)
//   node scripts/bake-static.mjs --force    寫檔時略過縮細 >20% 嘅保護(<50 條線嘅保護唔可以略過)
//
// 輸出檔(全部 minified 單行,無尾 newline,同 committed 檔一樣):
//   kmbGtfs.json    {"route|bound|serviceType": gtfsId}           KMB/LWB(所有有 bound 嘅 co)
//   ctbGtfs.json    同上,CTB
//   routeFares.json {"co|route|bound|serviceType": number[]}      逐站車費(index = 站序),只 kmb/ctb,primary co
//   planGraph.json  {routes:[{k,co,r,b,s,o,d,jt,st}], stops:{id:[lat,lng,nameTc]}}   kmb/ctb/nlb/gmb/lightRail,primary co
//   gmbRoutes.json  [{route,uid,bound,st,oTc,dTc}]                 uid = hkbus gtfsId
//   gmbData.json    {routes:[...gmbRoutes + stops[]], stops:{id:{n,lat,lng}}}
//   nlbData.json    {routes:[{route,id,bound,st,oTc,dTc,stops}], stops:{id:{n,lat,lng}}}   id = nlbId
//   lrData.json     {routes:[{route,bound,st,oTc,dTc,stops}], stops:{id:{n,lat,lng}}}     stop id 統一 LR 三位數(LR60→LR060)
//
// 「primary co」:聯營線(kmb+ctb)上游會列兩間公司,但 planGraph/routeFares 只出一條(第一間有 bound+stops 嘅),
// 免行程規劃出兩條一樣嘅車;gtfs 映射就兩間都出(前端按 co 查)。呢個同 6 月 committed 檔一致。
//
// 唔處理:lightRail.json(無 src/ 用家、有人手 _note)、mtrLines.json、hkDistricts.json、quotes.ts。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, relative } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')
const DATA_DIR = join(ROOT, 'src', 'data') // committed 檔(比較用)

// 上游候選 URL,順序試(sandbox 可能只有 raw.githubusercontent 通;CI 通常全部通)
const SOURCES = [
  'https://data.hkbus.app/routeFareList.min.json',
  'https://hkbus.github.io/hk-bus-crawling/routeFareList.min.json',
  'https://raw.githubusercontent.com/hkbus/hk-bus-crawling/gh-pages/routeFareList.min.json',
]
const FETCH_TIMEOUT_MS = 90_000
const FETCH_RETRIES = 2 // 每個 URL 試幾次
// 上游某公司少過 min(50, committed 數嘅一半)(而 committed 檔有)→ 拒絕寫
// (輕鐵本身只有 ~28 條,所以唔可以死板用 50)
const MIN_ROUTES_PER_CO = 50
const MAX_SHRINK = 0.2 // 任何檔縮細超過 20% → --check exit 1 / 寫檔拒絕(除非 --force)

// ---------- CLI ----------
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const opt = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const CHECK = flag('--check')
const FORCE = flag('--force')
const FROM = opt('--from')
const ONLY = opt('--only')
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const OUT_DIR = opt('--out') ? resolve(opt('--out')) : DATA_DIR // 寫檔目標(--out 用嚟 dry-run 落其他 folder)

const ALL_FILES = [
  'kmbGtfs',
  'ctbGtfs',
  'routeFares',
  'planGraph',
  'gmbRoutes',
  'gmbData',
  'nlbData',
  'lrData',
]
const FILES = ONLY ? ALL_FILES.filter((f) => ONLY.includes(f)) : ALL_FILES
for (const f of ONLY ?? []) {
  if (!ALL_FILES.includes(f)) {
    console.error(`未知檔名 --only ${f};可選:${ALL_FILES.join(',')}`)
    process.exit(2)
  }
}

// ---------- 抓上游 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchUpstream() {
  if (FROM) {
    console.log(`上游:本地檔 ${FROM}`)
    return { data: JSON.parse(readFileSync(FROM, 'utf8')), from: FROM }
  }
  const errors = []
  for (const url of SOURCES) {
    for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
      try {
        process.stdout.write(`抓 ${url} (${attempt}/${FETCH_RETRIES}) … `)
        const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const text = await res.text()
        const data = JSON.parse(text)
        console.log(`OK ${(Buffer.byteLength(text) / 1048576).toFixed(1)}MB`)
        return { data, from: url }
      } catch (e) {
        const msg = [e?.cause?.code, e?.cause?.message, e?.message].filter(Boolean).join(' / ') || String(e)
        console.log(`失敗:${msg}`)
        errors.push(`${url}: ${msg}`)
        if (attempt < FETCH_RETRIES) await sleep(1500 * attempt)
      }
    }
  }
  throw new Error(`所有上游都抓唔到:\n  ${errors.join('\n  ')}`)
}

// ---------- 上游驗證 ----------
function validateUpstream(up) {
  if (!up || typeof up !== 'object') throw new Error('上游唔係 JSON object')
  if (!up.routeList || typeof up.routeList !== 'object') throw new Error('上游缺 routeList')
  if (!up.stopList || typeof up.stopList !== 'object') throw new Error('上游缺 stopList')
  const n = Object.keys(up.routeList).length
  if (n < 1000) throw new Error(`上游 routeList 只有 ${n} 條,疑似唔完整`)
}

// ---------- 工具 ----------
// 輕鐵站 id 統一三位數:上游而家出 LR60,舊版/前端(lrData.ts、getSchedule station_id 註)用 LR060
const padLR = (id) => id.replace(/^LR(\d+)$/, (_, d) => `LR${d.padStart(3, '0')}`)

// 一條上游路線入面「有效」嘅公司:co 有列 + bound[co] 有 + stops[co] 係 array
// (上游有啲聯營線 co 寫 ["kmb","ctb"] 但只有 ctb 嘅 bound/stops)
const validCos = (r) => (r.co ?? []).filter((c) => r.bound?.[c] !== undefined && Array.isArray(r.stops?.[c]))
const primaryCo = (r) => validCos(r)[0]

const sortedObj = (obj) => {
  const out = {}
  for (const k of Object.keys(obj).sort()) out[k] = obj[k]
  return out
}

const stopTc = (sl, id) => sl[id]?.name?.zh ?? sl[id]?.name?.en ?? id

// ---------- 各檔生成 ----------
function buildGtfs(rl, co) {
  const out = {}
  for (const r of Object.values(rl)) {
    if (!r.gtfsId || !validCos(r).includes(co)) continue
    const k = `${r.route}|${r.bound[co]}|${r.serviceType}`
    if (!(k in out)) out[k] = String(r.gtfsId) // 撞 key 先到先得(上游順序)
  }
  return sortedObj(out)
}

function buildRouteFares(rl) {
  const out = {}
  for (const r of Object.values(rl)) {
    if (!Array.isArray(r.fares)) continue
    const co = primaryCo(r)
    if (co !== 'kmb' && co !== 'ctb') continue
    const k = `${co}|${r.route}|${r.bound[co]}|${r.serviceType}`
    if (!(k in out)) out[k] = r.fares.map(Number)
  }
  return out // 上游順序(同 committed 檔一樣)
}

const PLAN_COS = new Set(['kmb', 'ctb', 'nlb', 'gmb', 'lightRail'])
function buildPlanGraph(rl, sl, warn) {
  const routes = []
  const used = new Set()
  let skipped = 0
  for (const r of Object.values(rl)) {
    const co = primaryCo(r)
    if (!PLAN_COS.has(co)) continue
    const st = r.stops[co].map(padLR)
    const missing = st.filter((id) => !sl[id])
    if (missing.length) {
      skipped++
      continue // 站冇座標會令規劃器爆,整條線跳過
    }
    routes.push({
      k: `${co}|${r.route}|${r.bound[co]}|${r.serviceType}`,
      co,
      r: r.route,
      b: r.bound[co],
      s: String(r.serviceType),
      o: r.orig?.zh ?? '',
      d: r.dest?.zh ?? '',
      jt: r.jt === null || r.jt === undefined || r.jt === '' ? null : Number(r.jt),
      st,
    })
    for (const id of st) used.add(id)
  }
  if (skipped) warn(`planGraph:${skipped} 條線有站唔喺 stopList,已跳過`)
  const stops = {}
  for (const id of [...used].sort()) {
    const s = sl[id]
    stops[id] = [s.location.lat, s.location.lng, stopTc(sl, id)]
  }
  return { routes, stops }
}

function buildStopsMap(sl, ids) {
  const stops = {}
  for (const id of [...ids].sort()) {
    const s = sl[id]
    if (!s) continue
    stops[id] = { n: stopTc(sl, id), lat: s.location.lat, lng: s.location.lng }
  }
  return stops
}

function buildGmb(rl, sl, warn) {
  const routes = []
  const used = new Set()
  let noUid = 0
  for (const r of Object.values(rl)) {
    if (!validCos(r).includes('gmb')) continue
    if (!r.gtfsId) {
      noUid++
      continue // uid(gtfsId)係 ETA 必需
    }
    const stops = r.stops.gmb
    routes.push({
      route: r.route,
      uid: String(r.gtfsId),
      bound: r.bound.gmb,
      st: String(r.serviceType),
      oTc: r.orig?.zh ?? '',
      dTc: r.dest?.zh ?? '',
      stops,
    })
    for (const id of stops) used.add(id)
  }
  if (noUid) warn(`gmb:${noUid} 條線冇 gtfsId(uid),已跳過`)
  const missing = [...used].filter((id) => !sl[id]).length
  if (missing) warn(`gmb:${missing} 個站 id 唔喺 stopList(前端會 fallback 顯示 id)`)
  const small = routes.map((r) => ({
    route: r.route,
    uid: r.uid,
    bound: r.bound,
    st: r.st,
    oTc: r.oTc,
    dTc: r.dTc,
  }))
  return { small, full: { routes, stops: buildStopsMap(sl, used) } }
}

function buildNlb(rl, sl, warn) {
  const routes = []
  const used = new Set()
  let noId = 0
  for (const r of Object.values(rl)) {
    if (!validCos(r).includes('nlb')) continue
    if (r.nlbId === null || r.nlbId === undefined || r.nlbId === '') {
      noId++
      continue // nlbId 係 ETA 必需
    }
    const stops = r.stops.nlb
    routes.push({
      route: r.route,
      id: String(r.nlbId),
      bound: r.bound.nlb,
      st: String(r.serviceType),
      oTc: r.orig?.zh ?? '',
      dTc: r.dest?.zh ?? '',
      stops,
    })
    for (const id of stops) used.add(id)
  }
  if (noId) warn(`nlb:${noId} 條線冇 nlbId,已跳過`)
  return { routes, stops: buildStopsMap(sl, used) }
}

function buildLr(rl, sl) {
  const routes = []
  const used = new Set()
  for (const r of Object.values(rl)) {
    if (!validCos(r).includes('lightRail')) continue
    const stops = r.stops.lightRail.map(padLR)
    routes.push({
      route: r.route,
      bound: r.bound.lightRail,
      st: String(r.serviceType),
      oTc: r.orig?.zh ?? '',
      dTc: r.dest?.zh ?? '',
      stops,
    })
    for (const id of stops) used.add(id)
  }
  return { routes, stops: buildStopsMap(sl, used) }
}

// ---------- 比較(diff 統計) ----------
// 每個檔拆成一個或多個「key → value」map 做比較;array 檔用穩定 key(撞 key 加 #n)
const routeKeyers = {
  planGraph: (r) => `${r.k}|${r.o}|${r.d}`,
  gmbRoutes: (r) => `${r.route}|${r.uid}|${r.bound}|${r.st}`,
  gmbData: (r) => `${r.route}|${r.uid}|${r.bound}|${r.st}`,
  nlbData: (r) => `${r.route}|${r.id}|${r.bound}|${r.st}`,
  lrData: (r) => `${r.route}|${r.bound}|${r.st}`,
}
function arrToMap(arr, keyer) {
  const out = {}
  const seen = {}
  for (const r of arr) {
    let k = keyer(r)
    seen[k] = (seen[k] ?? 0) + 1
    if (seen[k] > 1) k = `${k}#${seen[k]}`
    out[k] = r
  }
  return out
}
/** 一個檔 → [{name, map}] */
function facets(name, data) {
  if (!data) return []
  if (name === 'kmbGtfs' || name === 'ctbGtfs' || name === 'routeFares') return [{ name, map: data }]
  if (name === 'gmbRoutes') return [{ name, map: arrToMap(data, routeKeyers[name]) }]
  return [
    { name: `${name}.routes`, map: arrToMap(data.routes ?? [], routeKeyers[name]) },
    { name: `${name}.stops`, map: data.stops ?? {} },
  ]
}
function diffMaps(before, after) {
  let added = 0
  let removed = 0
  let changed = 0
  let same = 0
  const samples = { added: [], removed: [], changed: [] }
  for (const k in after) {
    if (!(k in before)) {
      added++
      if (samples.added.length < 4) samples.added.push(k)
    } else if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      changed++
      if (samples.changed.length < 4) samples.changed.push(k)
    } else same++
  }
  for (const k in before) {
    if (!(k in after)) {
      removed++
      if (samples.removed.length < 4) samples.removed.push(k)
    }
  }
  return {
    before: Object.keys(before).length,
    after: Object.keys(after).length,
    same,
    added,
    removed,
    changed,
    samples,
  }
}

// 每個檔按公司計路線數(用嚟做 <50 保護)
function routesPerCo(name, data) {
  const out = {}
  const bump = (co) => (out[co] = (out[co] ?? 0) + 1)
  if (!data) return out
  if (name === 'kmbGtfs') out.kmb = Object.keys(data).length
  else if (name === 'ctbGtfs') out.ctb = Object.keys(data).length
  else if (name === 'routeFares') for (const k of Object.keys(data)) bump(k.split('|')[0])
  else if (name === 'planGraph') for (const r of data.routes) bump(r.co)
  else if (name === 'gmbRoutes') out.gmb = data.length
  else if (name === 'gmbData') out.gmb = data.routes.length
  else if (name === 'nlbData') out.nlb = data.routes.length
  else if (name === 'lrData') out.lightRail = data.routes.length
  return out
}

const readCommitted = (name) => {
  const p = join(DATA_DIR, `${name}.json`)
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
}

// ---------- main ----------
const warnings = []
const warn = (m) => warnings.push(m)

const { data: up, from } = await fetchUpstream()
validateUpstream(up)
const rl = up.routeList
const sl = up.stopList
{
  const coCount = {}
  for (const r of Object.values(rl)) for (const c of r.co ?? []) coCount[c] = (coCount[c] ?? 0) + 1
  console.log(
    `上游 ${from}\n  routeList ${Object.keys(rl).length} 條,stopList ${Object.keys(sl).length} 站,per co:`,
    coCount,
  )
}

const built = {}
if (FILES.includes('kmbGtfs')) built.kmbGtfs = buildGtfs(rl, 'kmb')
if (FILES.includes('ctbGtfs')) built.ctbGtfs = buildGtfs(rl, 'ctb')
if (FILES.includes('routeFares')) built.routeFares = buildRouteFares(rl)
if (FILES.includes('planGraph')) built.planGraph = buildPlanGraph(rl, sl, warn)
if (FILES.includes('gmbRoutes') || FILES.includes('gmbData')) {
  const g = buildGmb(rl, sl, warn)
  if (FILES.includes('gmbRoutes')) built.gmbRoutes = g.small
  if (FILES.includes('gmbData')) built.gmbData = g.full
}
if (FILES.includes('nlbData')) built.nlbData = buildNlb(rl, sl, warn)
if (FILES.includes('lrData')) built.lrData = buildLr(rl, sl)

// ---- 比較 + 保護 ----
const problems = [] // 會令 exit 1 / 拒絕寫嘅問題
const summary = []
for (const name of FILES) {
  const before = readCommitted(name)
  const after = built[name]
  const beforeCo = routesPerCo(name, before)
  const afterCo = routesPerCo(name, after)
  for (const co of Object.keys(beforeCo)) {
    const min = Math.min(MIN_ROUTES_PER_CO, Math.floor(beforeCo[co] / 2))
    if ((afterCo[co] ?? 0) < min) {
      problems.push(
        `${name}:${co} 上游只有 ${afterCo[co] ?? 0} 條線(committed 有 ${beforeCo[co]}),少過 ${min}`,
      )
    }
  }
  const fb = facets(name, before)
  const fa = facets(name, after)
  for (let i = 0; i < fa.length; i++) {
    const b = fb[i]?.map ?? {}
    const d = diffMaps(b, fa[i].map)
    const shrink = d.before > 0 ? 1 - d.after / d.before : 0
    if (shrink > MAX_SHRINK) {
      problems.push(
        `${fa[i].name}:會由 ${d.before} 縮到 ${d.after}(-${(shrink * 100).toFixed(0)}%),超過 ${MAX_SHRINK * 100}%`,
      )
    }
    summary.push({ facet: fa[i].name, ...d, shrink })
  }
}

// ---- 輸出 summary table ----
const pad = (s, n, right = false) => (right ? String(s).padStart(n) : String(s).padEnd(n))
console.log('')
console.log(
  pad('檔案', 20) +
    pad('before', 8, true) +
    pad('after', 8, true) +
    pad('same', 8, true) +
    pad('+added', 8, true) +
    pad('-removed', 9, true) +
    pad('~changed', 9, true),
)
for (const s of summary) {
  console.log(
    pad(s.facet, 20) +
      pad(s.before, 8, true) +
      pad(s.after, 8, true) +
      pad(s.same, 8, true) +
      pad(s.added, 8, true) +
      pad(s.removed, 9, true) +
      pad(s.changed, 9, true) +
      (s.shrink > MAX_SHRINK ? '  ⚠ 縮細' : ''),
  )
}
if (CHECK) {
  console.log('\n樣本(每類最多 4 個):')
  for (const s of summary) {
    if (!s.added && !s.removed && !s.changed) continue
    console.log(`  ${s.facet}`)
    if (s.samples.added.length) console.log(`    +added   ${s.samples.added.join(' , ')}`)
    if (s.samples.removed.length) console.log(`    -removed ${s.samples.removed.join(' , ')}`)
    if (s.samples.changed.length) console.log(`    ~changed ${s.samples.changed.join(' , ')}`)
  }
}
if (warnings.length) console.log('\n注意:\n  ' + warnings.join('\n  '))

if (CHECK) {
  if (problems.length) {
    console.error('\n--check 失敗:\n  ' + problems.join('\n  '))
    process.exit(1)
  }
  console.log('\n--check 完成,無寫檔。')
  process.exit(0)
}

// ---- 寫檔 ----
const hard = problems.filter((p) => p.includes('少過'))
const soft = problems.filter((p) => !p.includes('少過'))
if (hard.length || (soft.length && !FORCE)) {
  console.error(
    '\n拒絕寫檔:\n  ' +
      problems.join('\n  ') +
      (soft.length && !hard.length ? '\n  (縮細保護可用 --force 略過)' : ''),
  )
  process.exit(1)
}
if (soft.length) console.log('\n--force:略過縮細保護\n  ' + soft.join('\n  '))
let bytes = 0
mkdirSync(OUT_DIR, { recursive: true })
for (const name of FILES) {
  const text = JSON.stringify(built[name]) // minified 單行、無尾 newline,同 committed 檔一致
  const dest = join(OUT_DIR, `${name}.json`)
  writeFileSync(dest, text)
  const size = Buffer.byteLength(text)
  bytes += size
  console.log(`寫入 ${relative(ROOT, dest)} (${(size / 1024).toFixed(0)}KB)`)
}
console.log(`完成,共 ${(bytes / 1048576).toFixed(2)}MB。`)
