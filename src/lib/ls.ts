// localStorage 安全包裝:封鎖網站資料 / WebView 冇開 DOM storage 時,
// 單單讀 window.localStorage 都會 throw(SecurityError)或者係 null —— 唔好因此冧成個 app。
// 讀唔到當冇,寫唔到就算(功能照用,只係唔記得)。

export const lsGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

export const lsSet = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v)
  } catch {
    // 私密模式 / 容量滿 / 被封鎖:唔記得都照用
  }
}

export const lsDel = (k: string): void => {
  try {
    localStorage.removeItem(k)
  } catch {
    // 同上
  }
}
