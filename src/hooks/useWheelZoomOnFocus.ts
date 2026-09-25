import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

/** 桌面:撳過地圖(focus)先用滾輪縮放,撳走(blur)就還返畀頁面捲動。
 *  配 <MapContainer scrollWheelZoom={false}> 用,喺 MapContainer 入面嘅 component call。 */
export function useWheelZoomOnFocus(): void {
  const map = useMap()
  useEffect(() => {
    const on = () => map.scrollWheelZoom.enable()
    const off = () => map.scrollWheelZoom.disable()
    map.on('focus', on)
    map.on('blur', off)
    return () => {
      map.off('focus', on)
      map.off('blur', off)
    }
  }, [map])
}
