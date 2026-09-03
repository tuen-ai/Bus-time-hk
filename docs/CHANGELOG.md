# 更新紀錄

只記重要改動;逐個 commit 嘅細節睇 `git log`。

## 2026-09-03

### 工程 / 品質

- **工具鏈**:ESLint 10(typescript-eslint + react-hooks v7)、Prettier、Vitest(jsdom)。`npm run check` = lint + typecheck + test。
  44 個單元測試(時間、快取、推薦、附近排序、規劃索引、搜尋、備份、IndexedDB、返回鍵、輪詢)。
- **CI**:`ci.yml` 所有分支 push / PR 跑 lint + format check + typecheck + test + build;deploy 前都會先跑 lint + test。
- **靜態資料可以重生**:`scripts/bake-static.mjs` 由 hkbus 上游重焗 `src/data/*.json`(有縮細保護);
  `bake-static.yml` 每月 1 號自動跑 + commit。今次已用 9 月上游資料更新(路線 / 站序 / 車費 / 綠van / 嶼巴 / 輕鐵)。
- **Deploy workflow**:trigger 加 `main`;24/7 分店 bake 改每週 cache(3 小時一次嘅 cron 部署由 3 分鐘減到約 1 分鐘)。
- **ErrorBoundary**:render 出錯唔再白畫面,有「重新載入 / 清走快取」掣。
- **SW cache 自動版本**:build 時注入 git sha,唔使人手 bump;`cache.put` 包 `waitUntil`。
- **大快取搬去 IndexedDB**(`src/lib/kv.ts`):路線清單、九巴站點唔再靠 localStorage 5MB 上限;舊資料自動搬遷。
- **結構**:App.tsx 搜尋頁抽做 `SearchView`;`EtaList`(展示)/ `EtaPanel`(自輪詢)分開;收藏一個 loop 攞晒 ETA;
  `index.css` 拆做 `src/styles/` 20 個檔(`@import` 次序不變)。
- 型別清理:`@types/web-bluetooth`、`requestIdleCallback` / `wakeLock` 用原生型別。
- 刪走 `docs/HANDOFF-OPUS.md`(2026-07 交接文件,內容已過時)。

### 功能 / UX

- **返回鍵**:Android 返回鍵 / 瀏覽器上一頁 / 邊緣滑動逐層退返上一頁(揀地點 → 路線詳情 → 分頁 → 首頁),唔再一撳就閂 App;
  門口顯示模式鎖定層只彈提示。
- **搜尋支援目的地 / 站名**(有中文就搵站名,純英數就路線號)。
- Topbar 捲動自動收細;tabs sticky 位置改用實際量度(修正被 topbar 遮住);搜尋卡「往 / 由」分兩行;ETA skeleton;
  未揀主題時跟系統深色;`theme-color` 跟主題。
- 淺色模式輔助文字對比度由 2.9:1 提升到 4.6:1(WCAG AA)。
- 所有定時刷新喺背景分頁自動暫停(`usePolling`);同一 API 多處同時要只發一次(`memoAsync`);
  九巴站點記憶體快取;附近最近站排序記住。
- 備份檔補返「是日金句」同「附近預設營辦商」。
- README / footer 加私隱說明(地址搜尋後備會傳送去 komoot Photon)。

## 2026-07 及之前

見 `git log`:門口顯示模式(kiosk)、藍牙 e-ink 小屏推送、24/7 分店、TSM 路況、行程規劃、落車鬧鐘、集印卡等。
