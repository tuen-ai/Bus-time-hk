import L from 'leaflet'

// 同一個 label 重用同一個 icon:每秒重算巴士位置時,react-leaflet 見 icon 冇變就唔會 setIcon 重建 DOM。
// (Leaflet 每個 marker 自己 createIcon,共用 DivIcon 物件係安全嘅)
const cache = new Map<string, L.DivIcon>()
const CACHE_MAX = 200 // label 係「N分」,正常得幾十個;保險起見封頂

// 用 divIcon(CSS/HTML)避免 Leaflet 預設 marker 圖片喺打包後失效嘅問題
export function busIcon(label: string, primary = true): L.DivIcon {
  const k = `${label}|${primary ? 1 : 0}`
  let icon = cache.get(k)
  if (!icon) {
    if (cache.size >= CACHE_MAX) cache.clear()
    icon = L.divIcon({
      className: `map-icon-bus ${primary ? '' : 'secondary'}`,
      // 30px 闊嘅 icon 入面「3分」唔好斷開兩行
      html: `<div class="bus"><span aria-hidden="true">🚌</span><span class="bus-label" style="white-space:nowrap">${label}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    })
    cache.set(k, icon)
  }
  return icon
}
