// 地圖底圖設定。CARTO 免費 basemap(免 API key),適合公開細流量網站。
// 之後核實後可換成其他供應商;attribution 必須保留。
// 深色模式唔換底圖:map.css 將 .leaflet-tile-pane 反色,路線 / 站點顏色唔受影響。
import L from 'leaflet'

export const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

export const TILE_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

/** 手指為主嘅裝置(手機 / 平板,包括「桌面模式」iPad —— L.Browser.mobile 認唔到,要再睇 pointer: coarse)。
 *  呢類機嘅內嵌地圖要 dragging={false}:一隻手指留返畀頁面捲動,兩隻手指先郁 / 縮放地圖。 */
export function isTouchMap(): boolean {
  if (L.Browser.mobile) return true
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
}

/** 觸控機地圖下面嘅提示字 */
export const TOUCH_MAP_HINT = '兩隻手指移動地圖'
