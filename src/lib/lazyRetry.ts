// React.lazy 加「部署後自救」:PWA / 舊分頁開住跨過一次部署,hash 過嘅舊 chunk 已經唔喺伺服器,
// import 會失敗 → 本來成個 app 跌落 ErrorBoundary。而家有網就自動重載一次攞新版(畫面停喺載入中,唔閃錯誤頁);
// 離線或者啱啱自動重載過都仲失敗,先交返俾 ErrorBoundary。
// 防 loop 用 appUpdate.reloadOnce —— 同 main.tsx / ErrorBoundary 共用一個記號,唔會三個地方各自 reload 一次。
import { lazy, type ComponentType } from 'react'
import { reloadOnce } from './appUpdate'

/** 包住 import():成功照回;失敗(有網 + 容許自動重載)就重載,否則照拋 */
export function retryImport<M>(
  load: () => Promise<M>,
  tryReload: () => boolean = () => reloadOnce(),
): Promise<M> {
  return load().catch((e: unknown) => {
    if (!navigator.onLine || !tryReload()) throw e
    return new Promise<never>(() => {}) // 等重載,唔好閃 ErrorBoundary
  })
}

export function lazyRetry<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  return lazy(() => retryImport(load))
}
