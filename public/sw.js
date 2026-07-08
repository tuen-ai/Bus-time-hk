// 簡單 service worker:快取 app shell,API 請求一律走網絡(保持 ETA 即時)。
const CACHE = 'kmb-eta-v10'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.add('./')))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 只處理本網域 GET;API(data.etabus.gov.hk)直接走網絡
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // 導航請求:network-first,離線時回退快取
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./')))
    return
  }

  // tsm/ 路況、fitness.json 分店:每次部署會更新 → network-first,離線先用快取
  if (url.pathname.includes('/tsm/') || url.pathname.endsWith('fitness.json')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() => caches.match(request)),
    )
    return
  }

  // 靜態資源:cache-first(只 cache 成功回應,唔好鎖死 404)
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        }),
    ),
  )
})
