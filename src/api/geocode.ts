// 地點/地址搜尋 → 座標。先用香港政府 ALS(免費),失敗用 OSM Nominatim 後備。
export interface GeoPlace {
  label: string
  sub?: string
  lat: number
  lng: number
}

// ---- 政府 ALS 地址查詢 ----
async function als(q: string): Promise<GeoPlace[]> {
  const res = await fetch(
    `https://www.als.ogcio.gov.hk/lookup?q=${encodeURIComponent(q)}&n=8`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) },
  )
  if (!res.ok) throw new Error(String(res.status))
  const data = (await res.json()) as { SuggestedAddress?: AlsItem[] }
  const out: GeoPlace[] = []
  for (const s of data.SuggestedAddress ?? []) {
    const pa = s.Address?.PremisesAddress
    const geo = pa?.GeospatialInformation
    const lat = Number(geo?.Latitude)
    const lng = Number(geo?.Longitude)
    if (!lat || !lng) continue
    out.push({ label: chiLabel(pa) || q, sub: 'ALS', lat, lng })
  }
  return out
}

function chiLabel(pa?: AlsPremises): string {
  const c = pa?.ChiPremisesAddress
  if (!c) return ''
  const street = c.ChiStreet
    ? `${c.ChiStreet.StreetName ?? ''}${c.ChiStreet.BuildingNoFrom ?? ''}`
    : ''
  return [c.BuildingName, street, c.ChiDistrict?.DcDistrict]
    .filter(Boolean)
    .join(' ')
    .trim()
}

// ---- OSM Nominatim 後備 ----
async function nominatim(q: string): Promise<GeoPlace[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&countrycodes=hk&limit=8&accept-language=zh-HK&q=${encodeURIComponent(q)}`,
    { signal: AbortSignal.timeout(8000) },
  )
  if (!res.ok) throw new Error(String(res.status))
  const data = (await res.json()) as { display_name: string; lat: string; lon: string }[]
  return data.map((d) => {
    const parts = d.display_name.split(',').map((s) => s.trim())
    return { label: parts[0], sub: parts.slice(1, 3).join(', '), lat: Number(d.lat), lng: Number(d.lon) }
  })
}

export async function geocode(q: string): Promise<GeoPlace[]> {
  const query = q.trim()
  if (!query) return []
  try {
    const a = await als(query)
    if (a.length) return a
  } catch {
    /* fall through */
  }
  try {
    return await nominatim(query)
  } catch {
    return []
  }
}

// ---- ALS 回應型別(只取需要部分)----
interface AlsItem {
  Address?: { PremisesAddress?: AlsPremises }
}
interface AlsPremises {
  GeospatialInformation?: { Latitude?: string; Longitude?: string }
  ChiPremisesAddress?: {
    BuildingName?: string
    ChiStreet?: { StreetName?: string; BuildingNoFrom?: string }
    ChiDistrict?: { DcDistrict?: string }
  }
}
