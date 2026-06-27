# 🚌 九巴到站時間 · HK Bus ETA

查香港 **九巴 (KMB) / 龍運巴士 (LWB)** 實時到站時間的純前端 Web App。
資料來自運輸署開放數據(data.gov.hk),由 browser 直接呼叫,**無需自建後端、無需 API key**。

## 功能

- 🔍 **路線搜尋**:輸入路線號碼(如 `1A`、`269D`、`N269`)即時過濾。
- 🚏 **車站列表**:依方向 / 班次顯示整條路線的站序。
- ⏱️ **實時到站**:展開任一車站即見未來 3 班車「仲有幾分鐘」+ 預計時間 + 班次備註,**每 30 秒自動刷新**。
- ⭐ **收藏**:把「路線 + 車站」加入收藏,首頁直接顯示即時 ETA(存於 localStorage)。
- 📦 **本地緩存**:路線 / 站點靜態資料緩存一日,減少請求、加快載入。
- 📱 Mobile-first、繁體中文介面。

## 技術

- React 18 + TypeScript + Vite
- 無第三方 UI / 狀態管理庫,手寫 CSS
- 部署為純靜態檔案

## API

Base URL:`https://data.etabus.gov.hk/v1/transport/kmb`

| 用途 | Endpoint |
|------|----------|
| 全部路線 | `/route/` |
| 路線站序 | `/route-stop/{route}/{inbound\|outbound}/{service_type}` |
| 站點資料 | `/stop` |
| 到站時間 | `/eta/{stopId}/{route}/{service_type}` |

> 此 API 支援 CORS、無需認證、免費。資料只涵蓋九巴 / 龍運;城巴、新巴、嶼巴、綠 van、港鐵巴士為另外的 API。

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

## 資料來源

[運輸署 — 九巴/龍運巴士到站時間數據](https://data.gov.hk/tc-data/dataset/hk-td-tis_21-etakmb) · 使用須遵守 data.gov.hk 開放數據條款並註明來源。
