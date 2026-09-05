// 診斷工具:喺有網嘅環境(GitHub Actions)查真實 API 有冇某幾條路線。
// 開發沙盒封鎖 *.gov.hk,本機行唔到 —— 用 Actions 嘅 "Probe live APIs" workflow 手動觸發。
//
//   node scripts/probe-live.mjs 38 42C 1A
const WANT = (process.argv.slice(2).length ? process.argv.slice(2) : ['38', '42C']).map((r) =>
  r.toUpperCase(),
)

const get = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

const line = (r) => `${r.bound}|${r.service_type}  ${r.orig_tc} → ${r.dest_tc}`

console.log('查緊:', WANT.join(', '), '\n')

// ---- KMB ----
try {
  const { data } = await get('https://data.etabus.gov.hk/v1/transport/kmb/route/')
  console.log(`KMB /route/ 共 ${data.length} 條`)
  for (const want of WANT) {
    const hit = data.filter((r) => r.route.toUpperCase() === want)
    console.log(`  ${want}: ${hit.length ? hit.map(line).join(' ; ') : '❌ 冇'}`)
  }
  const prefix = (p) => data.filter((r) => r.route.toUpperCase().startsWith(p)).length
  console.log(`  (參考)以 4 開頭 ${prefix('4')} 條、以 3 開頭 ${prefix('3')} 條`)
} catch (e) {
  console.log('KMB 失敗:', e.message)
}

// ---- CTB ----
try {
  const { data } = await get('https://rt.data.gov.hk/v2/transport/citybus/route/CTB')
  console.log(`\nCTB /route/CTB 共 ${data.length} 條`)
  for (const want of WANT) {
    const hit = data.filter((r) => String(r.route).toUpperCase() === want)
    console.log(
      `  ${want}: ${hit.length ? hit.map((r) => `${r.orig_tc} → ${r.dest_tc}`).join(' ; ') : '❌ 冇'}`,
    )
  }
} catch (e) {
  console.log('CTB 失敗:', e.message)
}

// ---- 逐條試 route-stop + eta(確認真係查到到站)----
for (const want of WANT) {
  for (const dir of ['outbound', 'inbound']) {
    try {
      const { data } = await get(`https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${want}/${dir}/1`)
      console.log(`\nKMB ${want} ${dir} 站數 ${data.length}`)
      if (data.length) {
        const stop = data[0].stop
        const eta = await get(`https://data.etabus.gov.hk/v1/transport/kmb/eta/${stop}/${want}/1`)
        console.log(`  首站 ${stop} ETA ${eta.data.length} 筆`)
      }
    } catch (e) {
      console.log(`\nKMB ${want} ${dir}: ${e.message}`)
    }
  }
}
