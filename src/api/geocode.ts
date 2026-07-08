// 地點/地址搜尋 → 座標。
// 主來源:香港政府 ALS(als.gov.hk;舊 als.ogcio.gov.hk 已於 2024-07 停用)。
// 後備:Photon(komoot,專為 type-ahead,免 key、CORS)。
// (避免用 Nominatim 做 autocomplete —— 其使用條款不允許內建於應用程式自動查詢。)
export interface GeoPlace {
  label: string
  sub?: string
  lat: number
  lng: number
}

const ALS_HOSTS = ['https://www.als.gov.hk', 'https://www.als.ogcio.gov.hk']

async function als(q: string): Promise<GeoPlace[]> {
  let lastErr: unknown
  for (const host of ALS_HOSTS) {
    try {
      const res = await fetch(`${host}/lookup?q=${encodeURIComponent(q)}&n=8`, {
        headers: { Accept: 'application/json', 'Accept-Language': 'zh-Hant,en' },
        signal: AbortSignal.timeout(7000),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { SuggestedAddress?: AlsItem[] }
      const out: GeoPlace[] = []
      for (const s of data.SuggestedAddress ?? []) {
        const pa = s.Address?.PremisesAddress
        // GeospatialInformation 可能係 object 或 array —— 兩者都要處理
        const giRaw = pa?.GeospatialInformation
        const g = Array.isArray(giRaw) ? giRaw[0] : giRaw
        const lat = Number(g?.Latitude)
        const lng = Number(g?.Longitude)
        if (!lat || !lng) continue
        out.push({ label: chiLabel(pa) || q, sub: '地址', lat, lng })
      }
      return out
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

function chiLabel(pa?: AlsPremises): string {
  const c = pa?.ChiPremisesAddress
  if (!c) return ''
  const street = c.ChiStreet
    ? `${c.ChiStreet.StreetName ?? ''}${c.ChiStreet.BuildingNoFrom ?? ''}`
    : ''
  return [c.BuildingName, c.ChiEstate?.EstateName, street, c.ChiDistrict?.DcDistrict]
    .filter(Boolean)
    .join(' ')
    .trim()
}

// ---- Photon 後備 ----
async function photon(q: string): Promise<GeoPlace[]> {
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=default&bbox=113.8,22.15,114.45,22.56`,
    { signal: AbortSignal.timeout(7000) },
  )
  if (!res.ok) throw new Error(String(res.status))
  const data = (await res.json()) as {
    features?: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[]
  }
  return (data.features ?? []).map((f) => {
    const p = f.properties
    const [lng, lat] = f.geometry.coordinates
    return {
      label: p.name || p.street || q,
      sub: [p.district, p.city].filter(Boolean).join(' '),
      lat,
      lng,
    }
  })
}

export async function geocode(q: string): Promise<GeoPlace[]> {
  const query = q.trim()
  if (!query) return []
  try {
    const a = await als(query)
    if (a.length) return a
  } catch {
    /* fall through to photon */
  }
  try {
    return await photon(query)
  } catch {
    return []
  }
}

// ---- ALS 回應型別(只取需要部分)----
interface AlsItem {
  Address?: { PremisesAddress?: AlsPremises }
}
interface AlsGeo {
  Latitude?: string
  Longitude?: string
}
interface AlsPremises {
  GeospatialInformation?: AlsGeo | AlsGeo[]
  ChiPremisesAddress?: {
    BuildingName?: string
    ChiEstate?: { EstateName?: string }
    ChiStreet?: { StreetName?: string; BuildingNoFrom?: string }
    ChiDistrict?: { DcDistrict?: string }
  }
}
