import L from 'leaflet'

// 用 divIcon(CSS/HTML)避免 Leaflet 預設 marker 圖片喺打包後失效嘅問題

export const userIcon = L.divIcon({
  className: 'map-icon-user',
  html: '<div class="pulse"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

export const stopIcon = L.divIcon({
  className: 'map-icon-stop',
  html: '<div class="dot"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

export const stopIconActive = L.divIcon({
  className: 'map-icon-stop active',
  html: '<div class="dot"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

export function busIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: 'map-icon-bus',
    html: `<div class="bus">🚌<span class="bus-label">${label}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}
