// 地圖底圖(地政總署地形圖 + 繁中地名標籤),五個地圖共用;換供應商只改 lib/mapConfig.ts
import { TileLayer } from 'react-leaflet'
import { LABEL_URL, TILE_ATTRIB, TILE_OPTS, TILE_URL } from '../lib/mapConfig'

export default function BaseTiles() {
  return (
    <>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} {...TILE_OPTS} />
      <TileLayer url={LABEL_URL} {...TILE_OPTS} />
    </>
  )
}
