# 交接文件:可可出行 — 餘下工作設計規格

> 由 Fable 設計,交畀 Opus session 執行。
> 分支:`claude/hk-bus-eta-web-g7yxbq`(所有開發同 push 只可以去呢條分支,唔好開 PR)。
> Commit 唔可以含 model id;mascot 只可以用原創設計(唔可以複製 Bubu&Dudu 等受版權角色)。
> 沙盒 egress 封鎖所有 *.gov.hk(403)—— 政府 API 只可以喺 GitHub Actions runner 度試,
> 迭代方法:改 script → push → 用 GitHub MCP 讀 Actions log(見 §5)。

---

## 0. 現況快照(2026-07-02)

已上線功能:多營辦商 ETA(九巴/城巴/嶼巴/綠van/輕鐵/港鐵)、路線地圖+預測巴士、
天氣 banner、車費、行程規劃(直達+1轉乘)、粉紅少女風+原創熊貓/啡熊 mascot、
⏰ 出門倒數提醒、🔔 落車鬧鐘、🚌 只睇直達 filter、🚦 天氣面板(路況地圖 UI 已好,**等資料**)。

最新 commit:`7c72332`(TSM bake v5)。
Live site:https://tuen-ai.github.io/Bus-time-hk/ (目前內容 = `a95de55` 版,見 §2)。

---

## 1. 【必做・簡單】修復 TSM 路況幾何 bake

**檔案:`scripts/fetch-tsm.mjs`**

### 現況診斷(CI run 28605013296 log 已證實)

- CKAN discovery 正常:`hk-td-tis_15-road-network-v2` 有 61 個資源,
  入面有 `https://static.data.gov.hk/td/road-network-v2/CENTERLINE.gml`(要嘅)
  同 `CENTERLINE.kmz`。
- **Bug A**:`findRoadNetZip()` 用 `rs.find(r => /gml/i.test(...))` 攞第一個 GML,
  結果攞咗 `BUS_ONLY_LANE.gml`(0.3MB,錯檔)。
- **Bug B**:`roadNetFallback()` 無條件 `unzip`,但 `.gml` 係純文字唔係 zip → 「unzip 失敗」。

### 修法(兩處)

1. `findRoadNetZip()` 揀檔優先次序改成:
   ```js
   const pick =
     rs.find((r) => /centerline/i.test(`${r.name} ${r.url}`) && /\.gml/i.test(r.url)) ??
     rs.find((r) => /centerline/i.test(`${r.name} ${r.url}`) && /kmz|kml/i.test(`${r.format} ${r.url}`)) ??
     rs.find((r) => /gml/i.test(`${r.format} ${r.url}`))
   ```
2. `roadNetFallback()` 下載後:only unzip 當 url 係 `/\.(zip|kmz)$/i`;
   否則直接當文字檔用(`files = [downloadPath]`,將 dest 改名做 `.gml`)。
   ```js
   const isZip = /\.(zip|kmz)$/i.test(url)
   const dest = join(tmp, isZip ? 'roadnet.zip' : 'roadnet.gml')
   await download(url, dest)
   let files
   if (isZip) {
     const un = spawnSync('unzip', ['-o', '-q', dest, '-d', tmp], { stdio: 'inherit' })
     if (un.status !== 0) throw new Error('unzip 失敗')
     files = walkFiles(tmp).filter((f) => /\.(gml|kml|xml)$/i.test(f))
   } else {
     files = [dest]
   }
   ```

### 注意

- `CENTERLINE.gml` 可能幾百 MB —— stream 過濾已寫好(`extractFromMarkup` 8MB rolling
  buffer),`download()` timeout 已set 600s,唔使改。
- 軸序(E,N vs N,E)由 `finalizeLinks()` 全體投票決定,已單元測試,唔使改。
- 如果 GML 內 feature 唔係用 `ROUTE_ID` tag(例如namespace 唔同),
  log 會有 `[debug] … 頭段:` 樣本 —— 按樣本調整 `extractFromMarkup` 嘅 regex。
- 成功標準:log 見 `✓ 寫入 public/tsm/links.json(N 條)`,N 應該接近 4255
  (少過 50 會 throw)。

### 驗收

1. push 後用 MCP 睇 build job 嘅「Bake TSM traffic links」step log(§5 有指令樣板)。
2. 成功後開 live site → 天氣列撳「🚦 路況」→ 應該見到彩色路段地圖
   (綠=暢順/橙=一般/紅=擠塞)。
3. 如果地圖有嘢但顏色全綠/全紅得怪 —— 檢查 client `src/api/tsm.ts` 對
   `irnAvgSpeed-all.xml` 嘅欄位假設(§3)。

---

## 2. 【必做・一撳】重跑失敗咗嘅 Pages deploy

Run `28605013296`:build job ✅、deploy job ❌(`actions/deploy-pages@v4` 10 分鐘後
fail,artifact 已上載 —— 屬 GitHub Pages 臨時故障,唔係 code 問題)。

**做法**:完成 §1 push 之後自然會有新 run 連 deploy 一齊跑,唔使特登重跑舊 run。
如果新 run 嘅 deploy 又 fail(連續兩次),先用 MCP `actions_run_trigger` rerun,
再唔得就檢查 repo Settings→Pages 係咪仍然係 GitHub Actions 模式。

---

## 3. 【必做・驗證】irnAvgSpeed-all.xml 實際欄位 vs client 假設

**檔案:`src/api/tsm.ts`**

Client 而家兼容兩代欄位名(container:`jtis_speedmap`→`segment`→`SEGMENT`;
id:`LINK_ID/SEGMENT_ID/segment_id/link_id/id`;速度:`TRAFFIC_SPEED/traffic_speed/speed`;
飽和度缺失就由速度估:≥40 綠 / ≥20 橙 / <20 紅)。

**但二代 XML 實際結構未經真網絡驗證。**Opus 執行時要:

1. 喺 Actions 加一個臨時 debug(或本地機器有網嘅話直接 curl):
   `curl -s https://resource.data.one.gov.hk/td/traffic-detectors/irnAvgSpeed-all.xml | head -50`
   —— 最簡單係喺 `fetch-tsm.mjs` main() 尾段加幾行:fetch 該 XML 頭 2000 字元並
   console.log,push 一次,喺 CI log 讀真實 element 名,然後再改返 client。
2. 對照 client 的 tag 候選名單,唔啱就補。
   已知線索(spec:dataspec-traffic-data-strategic-major-roads.pdf):
   欄位大概有 segment_id、speed、valid、capture_date;root 可能係
   `<segments>` 或類似。`valid==='N'` 已會被 client 跳過。
3. 驗證 `CAPTURE_DATE`/`capture_date` 顯示喺面板右下(「資料時間 HH:MM」)。

**加分項(可選)**:速度分級門檻而家係全域(40/20 km/h)。快速公路 50+ 先算暢順、
市區 30 已經好順 —— 如果 `speed_segments_info.csv` 或 XML 有 road type,可以按類型分級。
冇都唔緊要,v1 用全域門檻。

---

## 4. 【建議・code review 補做】上輪 review workflow 因 session limit 全滅

以下係 Fable 人手圈出嘅可疑位,Opus 執行時逐個 check(改唔改由證據決定):

1. **`src/components/WeatherPanel.tsx` interval vs TTL 打平**:
   面板每 2 分鐘 `fetchTsm()`,而 `src/api/tsm.ts` TTL 又係 2 分鐘 ——
   interval tick 有機會啱啱早過 TTL 到期,攞到 stale cache,實際更新變 4 分鐘一次。
   **修法**:TTL 改 90s(`const TTL = 90 * 1000`)。
2. **`.banners` 遮住頁尾**:fixed banner 顯示時可能冚住 footer/最尾一個卡。
   **修法**:banner 顯示時畀 `.app` 加 `padding-bottom: 140px`(或喺
   `AlertBanners` mount 時 toggle 一個 class)。
3. **`src/lib/alarm.ts` 一開始已喺 400m 內**:啱啱上車嗰陣通常未夠 400m,
   但如果用戶喺目的站附近設鬧鐘,會即刻響。可接受,但最好:第一個 GPS fix
   如果已 <400m,顯示提示而唔響鈴(`fired` 照 set,但唔 call `alertAll`)。
   自行判斷值唔值得做。
4. **`src/components/PlannerView.tsx` 改咗 `arriveBy` 後提醒唔會跟住變**:
   `remindSet` 只係 index,`setReminder` 嘅時間唔會隨 arriveBy 改變自動更新。
   **修法**:`arriveBy` onChange 時 `setRemindSet(null)`(畀用戶再撳一次)。
5. **`src/App.tsx` openLeg 對 GMB 嘅 tiebreak**:用 `dest_tc` 對 PlanRoute.d ——
   兩邊字串來源唔同(hkbus vs 官方 API),可能永遠唔 equal,fallback 係 cands[0],
   行為可接受;可以改成 `includes` 寬鬆匹配。低優先。
6. **`beep()` 喺 fire 時 AudioContext 可能被瀏覽器 suspend**(page 喺背景)——
   已有 resume() 嘗試 + vibrate + notification 兜底,可接受;唔使改。

---

## 5. 執行環境 cheat-sheet(俾 Opus)

- **睇 CI**:`mcp__github__actions_list`(method=`list_workflow_runs`,owner=`wkcda`,
  repo=`Bus-time-hk`,filter branch)→ 攞 run id → `list_workflow_jobs` → build job id
  → `mcp__github__get_job_logs`(return_content=true,tail_lines=20000)。
  ⚠️ 回應可能超長被寫入檔案 —— 用 python 讀檔搵 `fetch-tsm` 段落。
- **runs list 好大**:per_page=1 都會 366KB —— 直接 python json.load 個 saved file。
- **push 即自動 deploy**(deploy.yml,branch push trigger)。
- **SW 快取**:改咗 client 見得到嘅嘢記得 bump `public/sw.js` 嘅 `CACHE`(而家 v4)。
- **本地 build 檢查**:`npm run build`(tsc + vite)。
- **playwright 截圖**:`npm i playwright-core --no-save`,executablePath
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,`--no-sandbox`,用完 uninstall。

---

## 6. Backlog(用戶已知,未排期)

- Mascot 變體:用戶睇咗熊貓 6 款(A-F)同棕熊 6 款(A-F,E=原創太空騎士),
  **未揀** —— 揀咗先改 `src/components/Mascots.tsx`。
- 規劃器:港鐵 rail leg + 車站對車站車費(bake opendata.mtr.com.hk CSV)、
  live ETA 候車時間、全營辦商車費 + 八達通轉乘優惠。
- 之前腦暴清單(11-20):語音播報、站號/QR 直達、準時度評分、車費錢包、
  低地台標示、OLED 純黑模式、英文/簡體。
