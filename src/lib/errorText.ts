// 錯誤訊息轉做用家睇得明嘅中文。
// 自己拋嘅中文訊息(例如「唔係可可出行嘅備份檔」「港鐵資料格式異常」)照出;
// 瀏覽器 / 伺服器原文(英文,例如 JSON.parse 嘅 "Unexpected token")唔好直接畀用家睇 → 用 fallback。
const CJK = /[㐀-鿿]/

export function zhErrorOr(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  return CJK.test(msg) ? msg : fallback
}
