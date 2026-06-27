import L from 'leaflet'

// 用 divIcon(CSS/HTML)避免 Leaflet 預設 marker 圖片喺打包後失效嘅問題
export function busIcon(label: string, primary = true): L.DivIcon {
  return L.divIcon({
    className: `map-icon-bus ${primary ? '' : 'secondary'}`,
    html: `<div class="bus">🚌<span class="bus-label">${label}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}
