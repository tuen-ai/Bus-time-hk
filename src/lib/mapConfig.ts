// 地圖底圖:地政總署「地形圖」+「地名標籤」(繁中)XYZ 圖塊 —— 官方、免 API key、CORS 開放。
// 以前用 CARTO,但 CARTO 由 2026 年 9 月起免 key 圖塊全部印「API KEY REQUIRED」水印。
// 條款:地圖面要有地政總署 logo + 版權聲明(TILE_ATTRIB)。z10–z20 有圖(z8 以下冇),只覆蓋香港。
// 深色模式唔換底圖:map.css 將 .leaflet-tile-pane 反色(連標籤),路線 / 站點顏色唔受影響。
import L from 'leaflet'
import type { TileLayerOptions } from 'leaflet'

const LANDSD = 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz'
export const TILE_URL = `${LANDSD}/basemap/WGS84/{z}/{x}/{y}.png`
export const LABEL_URL = `${LANDSD}/label/hk/tc/WGS84/{z}/{x}/{y}.png`

export const TILE_ATTRIB =
  '<a href="https://api.portal.hkmapservice.gov.hk/disclaimer" target="_blank" rel="noreferrer">&copy; Map information from Lands Department</a>' +
  '<img class="landsd-logo" src="https://api.hkmapservice.gov.hk/mapapi/landsdlogo.jpg" alt="地政總署" width="18" height="18">'

/** 圖塊選項:縮到 z10 以下用 z10 圖縮細;只喺香港範圍請求(縮到好細都唔會狂拎圖) */
export const TILE_OPTS: TileLayerOptions = {
  minNativeZoom: 10,
  maxZoom: 19,
  bounds: [
    [22.1, 113.8],
    [22.6, 114.5],
  ],
}

/** 手指為主嘅裝置(手機 / 平板,包括「桌面模式」iPad —— L.Browser.mobile 認唔到,要再睇 pointer: coarse)。
 *  呢類機嘅內嵌地圖要 dragging={false}:一隻手指留返畀頁面捲動,兩隻手指先郁 / 縮放地圖。 */
export function isTouchMap(): boolean {
  if (L.Browser.mobile) return true
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
}

/** 觸控機地圖下面嘅提示字 */
export const TOUCH_MAP_HINT = '兩隻手指移動地圖'
