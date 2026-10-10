// 診斷工具:檢查 ntfy.sh 可唔可以由瀏覽器(冇後端)直接排程推送(開發沙盒封鎖 ntfy.sh,要喺 Actions 跑)。
// Actions → Probe live APIs → 剔「ntfy」→ Run workflow。
//
// 會做:CORS 預檢、JSON 發佈 + delay 排程(隨機 topic,內容係測試字句)、查返排程中嘅訊息、試刪除 / 取消排程。
import { randomBytes } from 'node:crypto'

const BASE = 'https://ntfy.sh'
const ORIGIN = 'https://tuen-ai.github.io'
const topic = `kkcx-probe-${randomBytes(9).toString('hex')}`
const show = async (label, res) => {
  const h = {}
  for (const [k, v] of res.headers) if (/^access-control|^content-type|^x-/.test(k)) h[k] = v
  let body = ''
  try {
    body = (await res.text()).slice(0, 600)
  } catch {
    /* 冇 body */
  }
  console.log(`\n== ${label}\n  ${res.status} ${JSON.stringify(h)}\n  ${body.replace(/\n/g, '\n  ')}`)
  return body
}
const go = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(20000) })

await show('health', await go(`${BASE}/v1/health`))
await show(
  'CORS 預檢(POST JSON)',
  await go(`${BASE}/`, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  }),
)
await show(
  'CORS 預檢(DELETE)',
  await go(`${BASE}/${topic}/x`, {
    method: 'OPTIONS',
    headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'DELETE' },
  }),
)

// 排程 2 日後(中文內容 + click + tags),睇 response 格式
const body = await show(
  '發佈(JSON, delay 2 日)',
  await go(`${BASE}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({
      topic,
      title: '可可出行測試 🎒',
      message: '測試排程:出門記得帶 🔑 鎖匙、💳 八達通、☂️ 遮',
      tags: ['school_satchel'],
      click: 'https://tuen-ai.github.io/Bus-time-hk/#checklist',
      delay: '2d',
    }),
  }),
)
let id = null
try {
  id = JSON.parse(body).id
} catch {
  /* ignore */
}
// 3 日以上會唔會拒絕
await show(
  '發佈(delay 4 日,睇上限)',
  await go(`${BASE}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, message: 'limit test', delay: '4d' }),
  }),
)
// 用 unix timestamp 排程(At)
await show(
  '發佈(header At = unix 秒)',
  await go(`${BASE}/${topic}`, {
    method: 'POST',
    headers: { At: String(Math.floor(Date.now() / 1000) + 3600), Title: 'header test' },
    body: 'header at test',
  }),
)
await show(
  '查排程中訊息(poll + sched)',
  await go(`${BASE}/${topic}/json?poll=1&sched=1`, { headers: { Origin: ORIGIN } }),
)
if (id) {
  await show(
    `刪除排程 DELETE /${topic}/${id}`,
    await go(`${BASE}/${topic}/${id}`, { method: 'DELETE', headers: { Origin: ORIGIN } }),
  )
  await show('刪除後再查', await go(`${BASE}/${topic}/json?poll=1&sched=1`))
}
// 用 sequence id 更新 / 取消(新版 ntfy 先有):PUT 同一個 id
await show(
  '用自訂 id 發佈(sequence)',
  await go(`${BASE}/${topic}/kkcx-seq-1`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'X-Delay': '1d' },
    body: 'sequence test',
  }),
)
await show('自訂 id 後再查', await go(`${BASE}/${topic}/json?poll=1&sched=1`))
await show('DELETE 自訂 id', await go(`${BASE}/${topic}/kkcx-seq-1`, { method: 'DELETE' }))
await show('最後再查', await go(`${BASE}/${topic}/json?poll=1&sched=1`))
console.log(`\n(topic: ${topic})`)
