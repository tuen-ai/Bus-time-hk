// Service worker:快取 app shell + 今次 build 嘅 JS/CSS,API 請求一律走網絡(保持 ETA 即時)。
// cache 名同預載清單都係 build 時注入(vite.config.ts 嘅 sw-precache plugin),每次部署自動換新,唔使人手 bump。
const CACHE = 'kmb-eta-__BUILD_ID__'
// 記住「而家」同「上一個」版本嘅 cache 名:上一版留多一個版本,開住嘅舊 tab lazy import 仲攞得到舊 chunk
const META = 'kkcx-sw-meta'
const META_URL = './__sw-meta__'
// 導航最多等網絡 3 秒,再慢就用快取外殼(巴士站得一格訊號都要即開)
const NAV_TIMEOUT_MS = 3000

// build 時換成今次 build 嘅清單(dev 冇換:淨係 cache './')
// PRECACHE:install 時一定要攞齊(外殼 + JS/CSS,唔包超大嘅 planGraph);ASSETS:assets/ 全部檔名
const PRECACHE = /* __PRECACHE__ */ ['./']
const ASSETS = /* __ASSETS__ */ []

const isHashed = (url) => url.startsWith('./assets/')

self.addEventListener('install', (e) => {
  // 攞齊先 skipWaiting:半桶水嘅新版唔好搶舊版控制權;失敗就留返舊版,瀏覽器下次再試
  e.waitUntil(precache().then(() => self.skipWaiting()))
})

async function precache() {
  const cache = await caches.open(CACHE)
  await Promise.all(
    PRECACHE.map(async (url) => {
      // assets/ 檔名有 content hash:同名 = 同內容 → 由舊版 cache 抄過嚟,唔使再下載
      const old = isHashed(url) && (await caches.match(url))
      if (old) return cache.put(url, old)
      // 外殼要避開 HTTP cache(GitHub Pages max-age=600),唔係會 cache 咗上一版 index.html
      const res = await fetch(new Request(url, { cache: isHashed(url) ? 'default' : 'no-cache' }))
      if (!res.ok) throw new Error(`precache ${url} → ${res.status}`)
      if (url === './') await assertSameBuild(res.clone())
      await cache.put(url, res)
    }),
  )
  // 唔預載嘅大檔(planGraph):今次 build 仲係同一個 hash,就由舊版 cache 帶過嚟,唔使再下載 2MB
  await Promise.all(
    ASSETS.map((f) => `./${f}`)
      .filter((url) => !PRECACHE.includes(url))
      .map(async (url) => {
        const old = await caches.match(url)
        if (old) await cache.put(url, old)
      }),
  )
}

// CDN 部署中途可能半新半舊:index.html 引用嘅 assets 唔喺今次清單 → install 失敗,等下次再試
async function assertSameBuild(res) {
  if (!ASSETS.length) return // dev
  const html = await res.text()
  for (const [, file] of html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)) {
    if (!ASSETS.includes(file)) throw new Error(`index.html 唔係今次 build(${file})`)
  }
}

self.addEventListener('activate', (e) => {
  e.waitUntil(
    pruneCaches()
      .catch(() => {})
      .then(() => self.clients.claim()),
  )
})

// 只留今個版本 + 上一個版本(舊 tab 嘅 lazy chunk 靠佢);再舊嘅刪走
async function pruneCaches() {
  const meta = await readMeta()
  const previous = !meta ? null : meta.current !== CACHE ? meta.current : meta.previous
  await writeMeta({ current: CACHE, previous })
  // 由未有 meta 嘅舊版 SW 升級:唔知邊個係上一版 → 今次全部留低,下個版本先清
  if (!meta) return
  const keep = new Set([CACHE, META, previous])
  const keys = await caches.keys()
  await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
}

async function readMeta() {
  try {
    const res = await (await caches.open(META)).match(META_URL)
    return res ? await res.json() : null
  } catch {
    return null
  }
}

async function writeMeta(meta) {
  const c = await caches.open(META)
  await c.put(
    META_URL,
    new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }),
  )
}

// 淨係搵今個版本嘅 cache
async function matchOwn(request) {
  return (await caches.open(CACHE)).match(request)
}

// 先搵今個版本嘅 cache(caches.match 按建立次序搵,會搵到上一版嘅舊檔)
async function matchFresh(request) {
  return (await matchOwn(request)) || caches.match(request)
}

// 導航:network-first,但最多等 NAV_TIMEOUT_MS;太慢 / 斷線 / 5xx 就用快取外殼
async function navigate(request) {
  const net = fetch(request)
  const res = await Promise.race([net.catch(() => null), new Promise((r) => setTimeout(r, NAV_TIMEOUT_MS))])
  if (res && res.status < 500) return res
  // 冇快取外殼(未 install 完)就照等網絡
  return (await matchFresh('./')) || net
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 只處理本網域 GET;API(data.etabus.gov.hk)直接走網絡
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request))
    return
  }

  // tsm/ 路況、fitness.json 分店:每次部署會更新 → network-first,離線先用快取
  if (
    url.pathname.includes('/tsm/') ||
    url.pathname.endsWith('fitness.json') ||
    url.pathname.endsWith('news.json')
  ) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            // waitUntil:SW 唔會喺寫 cache 寫到一半就被殺
            event.waitUntil(caches.open(CACHE).then((c) => c.put(request, copy)))
          }
          return res
        })
        .catch(() => matchFresh(request)),
    )
    return
  }

  // 靜態資源:cache-first(只 cache 成功回應,唔好鎖死 404)。
  // assets/ 有 content hash → 邊個版本嘅 cache 都啱用;其他(geom/ 每次部署重新 bake)淨係信今個版本,
  // 唔係新版成個週期都會用緊上一版嘅舊檔;離線先退返用舊版頂住
  const hashed = url.pathname.includes('/assets/')
  event.respondWith(
    (hashed ? matchFresh(request) : matchOwn(request)).then(
      (hit) =>
        hit ||
        fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone()
              event.waitUntil(caches.open(CACHE).then((c) => c.put(request, copy)))
            }
            return res
          })
          .catch(async (err) => {
            const stale = !hashed && (await caches.match(request))
            if (stale) return stale
            throw err
          }),
    ),
  )
})
