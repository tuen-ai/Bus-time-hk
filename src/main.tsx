import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import UpdateToast from './components/UpdateToast'
import { checkForNewBuild, isUpdateReady, reloadOnce, runningBuildGone } from './lib/appUpdate'
import 'leaflet/dist/leaflet.css'
import './index.css'

// lazy chunk 載入失敗(Vite 會先 dispatch 呢個 event):部署咗新版、舊 chunk 已經唔喺 server → 自動 reload 一次。
// 唔 preventDefault:照拋返畀 caller(lazy / .catch / ErrorBoundary),否則 import 會「成功」但係 undefined。
window.addEventListener('vite:preloadError', () => {
  if (!navigator.onLine) return // 離線 reload 都冇用,交返 caller 自己 fallback
  if (isUpdateReady()) {
    reloadOnce() // 新 SW 已經接手 = 呢頁係舊 build
    return
  }
  // 未肯定:而家嘅 entry script 404 先 reload;網絡唔穩(例如 idle 預載 planGraph 失敗)唔好亂 reload
  void runningBuildGone().then((gone) => {
    if (gone) reloadOnce()
  })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <UpdateToast />
    </ErrorBoundary>
  </StrictMode>,
)

// 註冊 service worker(PWA:可安裝 / 加入主畫面 / 離線開啟外殼)
if ('serviceWorker' in navigator) {
  const sw = navigator.serviceWorker
  // 第一次裝 SW(clients.claim)都會觸發 controllerchange → 之前已經有 controller 先算「換新版」
  let hadController = !!sw.controller
  sw.addEventListener('controllerchange', () => {
    if (hadController) void checkForNewBuild()
    hadController = true
  })

  const HOUR = 60 * 60_000
  window.addEventListener('load', () => {
    sw.register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        // 長開嘅 tab / 顯示模式 / 由背景拎返出嚟:至少每個鐘問一次有冇新版
        let last = Date.now()
        const check = () => {
          if (Date.now() - last < HOUR) return
          last = Date.now()
          Promise.resolve()
            .then(() => reg.update())
            .catch(() => {
              // 離線 / server 出錯:下次再試
            })
        }
        setInterval(check, 10 * 60_000)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check()
        })
      })
      .catch(() => {
        // 註冊失敗不影響主要功能
      })
  })
}
