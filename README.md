# 🚌 可可出行 · 香港交通到站 (HK Transit)

**▶️ 線上試用:https://tuen-ai.github.io/Bus-time-hk/**

查香港 **九巴 (KMB) / 龍運 (LWB) / 城巴 (CTB) / 嶼巴 (NLB) / 綠van (GMB) / 輕鐵 (LR) / 港鐵 (MTR)** 實時到站時間的純前端 Web App,另有天氣警告、車費、沿途交通事故預警。
資料來自運輸署開放數據(data.gov.hk),由 browser 直接呼叫,**無需自建後端、無需 API key**。

> 營辦商:搜尋會同時顯示九巴同城巴(路線號可能重複,以紅色 / 青色 badge 區分)。
> 城巴 API 無「全線一次 ETA」endpoint,所以**城巴路線冇預測巴士公仔**,只有路線地圖 + 逐站到站時間。

## 功能

- 🔍 **路線搜尋**:輸入路線號碼(如 `1A`、`269D`、`N269`)即時過濾。
- 🚏 **車站列表**:依方向 / 班次顯示整條路線的站序。
- ⏱️ **實時到站**:展開任一車站即見未來 3 班車「仲有幾分鐘」+ 預計時間 + 班次備註,**每 5 秒自動刷新**,亦可手動刷新。
- 🗺️ **路線地圖 + 預測巴士位置**:每條路線畫出**真實沿路行車幾何**,並顯示**識郁嘅「預測巴士公仔」** —— 因 KMB API 無 GPS,位置由到站時間 (ETA) + 站序 + 沿線距離推算(turf 內插),**僅供參考**。
- 🚇 **港鐵 Next Train**:「鐵路」分頁,9 條重鐵線(機場快綫/東涌/屯馬/將軍澳/東鐵/南港島/荃灣/港島/觀塘),揀線→揀站→顯示上行/下行**下一班幾分鐘 + 月台 + 往邊個總站**,地圖畫出該線同轉乘標示。資料 © 港鐵公司 (data.gov.hk)。
- 🌦️ **天氣**:頂部天文台警告 banner(暴雨/颱風)+ 氣溫;揀巴士站時若該區落雨,地圖會喺該位置顯示**雨點特效**。
- 🎫 **車費**:路線詳情顯示全程車費,以及**逐站上車車費**(支援分段收費)。資料 build 時抽自 hkbus,動態載入唔加重首屏。
- 🧭 **行程規劃**:點對點最快路線(直達 + 1 轉乘,計車費),支援「家/公司」喜好預設、地址搜尋(ALS + 本地站名)、地圖揀點;「只睇直達」filter;方案入面撳路線號直接跳去實時到站。
- ⏰ **出門倒數**:規劃時設「幾點前要到」,每個方案顯示**最遲出門時間**,一撳設提醒 —— 夠鐘震動+響鈴+通知(app 開住先生效)。
- 🔔 **落車鬧鐘**:路線頁每個站有鐘仔,用 GPS 監測,**接近目的站(<400 米)自動震動+響鈴+通知**提你落車,底部顯示實時距離。
- 🚦 **全港路況**:天氣列一撳展開 —— 溫度/濕度/分區雨量 + **地圖顯示主要道路塞車情況**(運輸署 TSM 車速,綠=暢順/橙=一般/紅=擠塞,每 2 分鐘更新)+ 特別交通消息。
- ⭐ **收藏**:把「路線 + 車站」加入收藏,首頁直接顯示即時 ETA(存於 localStorage)。
- 🌙 **深色模式**:一鍵切換,記住偏好。
- 📺 **門口顯示模式**(iPad 橫擺 kiosk):大字時鐘 + 收藏路線實時到站(10 秒刷新)+ 是日勵志名句 + 天氣 + 香港新聞輪播 + 雙公仔;19:00–07:00 自動深色,wake lock 防瞓,`#display` 直達;**畫面鎖定**(誤觸只彈提示,長按 3 秒先退出),iOS「加入主畫面」後全屏冇 Safari bar。金句可喺設定揀:每日自動轉/固定一句/自己寫。設定(⚙️)開啟。
- 🖥️ **推送去藍牙小屏**(SKD-CLOCK e-ink):將收藏路線到站畫成圖,經 Web Bluetooth 推去藍牙電子墨水小屏,每分鐘自動更新;自動偵測解像度/黑白或三色,即將到站標紅。設定(⚙️)開啟,用桌面/安卓 Chrome 或 Edge(iOS 需 Bluefy)。
- 🔙 **返回鍵**:Android 返回鍵 / 瀏覽器上一頁 / 邊緣滑動,會逐層退返上一個畫面(揀地點 → 路線詳情 → 分頁 → 首頁),唔會一撳就閂咗成個 App;門口顯示模式已鎖定,撳返回只彈提示,要長按 3 秒先退出。
- 📲 **PWA**:可「加入主畫面」當 App 用,離線可開啟外殼。
- 📦 **本地緩存**:路線 / 站點靜態資料緩存一日,減少請求、加快載入。
- 📱 Mobile-first、繁體中文介面。

## 技術

- React 18 + TypeScript + Vite
- 無第三方 UI / 狀態管理庫,手寫 CSS
- 部署為純靜態檔案
- 所有定時刷新(到站 / 附近 / 港鐵 / 路況)喺分頁轉去背景時自動暫停,返嚟即刻補一次(`src/hooks/usePolling.ts`);同一個 API 多處同時要都只會發一次請求(`src/lib/cache.ts`)

## API

Base URL:`https://data.etabus.gov.hk/v1/transport/kmb`

| 用途 | Endpoint |
|------|----------|
| 全部路線 | `/route/` |
| 路線站序 | `/route-stop/{route}/{inbound\|outbound}/{service_type}` |
| 站點資料 | `/stop` |
| 指定路線到站時間 | `/eta/{stopId}/{route}/{service_type}` |
| 一站所有路線到站時間 | `/stop-eta/{stopId}` |

> 此 API 支援 CORS、無需認證、免費。資料只涵蓋九巴 / 龍運;城巴、新巴、嶼巴、綠 van、港鐵巴士為另外的 API。

### 路線形狀(行車幾何)

KMB ETA API **不含**路線幾何或 GPS。真實行車路線取自社群資料 [hkbus/route-waypoints](https://github.com/hkbus/route-waypoints)(沿道路 MultiLineString GeoJSON,CORS 開放,逐條 lazy load)。`src/data/kmbGtfs.json` 是 build 時抽出的精簡 `route|bound|serviceType → gtfsId` 映射表(~26KB),避免在 client 下載 8MB 的完整 route 清單。缺幾何時自動退回「站對站直線」。

### 預測巴士位置(無 GPS,僅供參考)

因無車輛 GPS,地圖上的巴士位置為推算:每 30 秒取 `route-eta`,每站取 `eta_seq=1` 的到站時間;用 turf 將各站 snap 到路線折線取累積距離;沿 seq 串成單車軌跡(時間單調遞增),在已過站與下一站之間按時間比例 + `turf.along` 內插出座標,每秒按時鐘平滑前移。循環線以 `seq`(非 stop_id)鎖定弧段。屬估算,非實時量度。

## 本地開發

```bash
npm install
npm run dev        # 開發伺服器 http://localhost:5173
npm run build      # 產出 dist/ 靜態檔案
npm run preview    # 預覽 build 結果
```

> ⚠️ 部分企業 / 沙盒網絡會封鎖 `data.etabus.gov.hk`,需把該網域加入白名單才可取得即時資料。一般家用 / 行動網絡可正常使用。

## 部署

`npm run build` 後將 `dist/` 內容上傳到任何靜態托管:

- **GitHub Pages**:把 `dist/` 推到 `gh-pages` 分支(`vite.config.ts` 已設 `base: './'`,可放於子目錄)。
- **Vercel / Netlify**:framework 選 Vite,build command `npm run build`,output `dist`。

## 資料來源與私隱

- App 純前端,冇後端、冇帳號、冇追蹤;收藏、地點、印仔、通勤習慣全部只存喺你部機(localStorage / IndexedDB),備份檔由你自己匯出。
- 規劃頁嘅地址搜尋會將你輸入嘅文字傳送到香港政府 ALS 地址查詢服務;ALS 冇結果時後備用 komoot Photon(第三方)。地圖底圖由 CARTO 提供,瀏覽器會向佢哋請求圖塊。
- 其他所有實時資料都係瀏覽器直接向 data.gov.hk / 港鐵 / 天文台開放 API 請求。


[運輸署 — 九巴/龍運巴士到站時間數據](https://data.gov.hk/tc-data/dataset/hk-td-tis_21-etakmb) · 使用須遵守 data.gov.hk 開放數據條款並註明來源。
