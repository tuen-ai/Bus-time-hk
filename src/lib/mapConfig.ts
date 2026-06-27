// 地圖底圖設定。CARTO 免費 basemap(免 API key),適合公開細流量網站。
// 之後核實後可換成其他供應商;attribution 必須保留。
export const TILE_URL =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

export const TILE_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
