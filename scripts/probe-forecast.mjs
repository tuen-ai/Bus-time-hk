// 診斷工具:天文台九天預報(fnd)同本港預報(flw)欄位(開發沙盒封鎖 *.gov.hk,要喺 Actions 跑)。
// Actions → Probe live APIs → 剔「forecast」→ Run workflow。
const API = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php'
for (const dataType of ['fnd', 'flw']) {
  try {
    const res = await fetch(`${API}?dataType=${dataType}&lang=tc`, { signal: AbortSignal.timeout(20000) })
    const json = await res.json()
    console.log(
      `\n== ${dataType} ${res.status} cors:${res.headers.get('access-control-allow-origin') ?? '-'}`,
    )
    if (dataType === 'fnd') {
      console.log('  頂層欄位:', Object.keys(json).join(', '))
      for (const d of (json.weatherForecast ?? []).slice(0, 3)) console.log('  ' + JSON.stringify(d))
    } else {
      console.log('  ' + JSON.stringify(json).slice(0, 1200))
    }
  } catch (e) {
    console.log(`\n== ${dataType} 失敗:${e.message}`)
  }
}
