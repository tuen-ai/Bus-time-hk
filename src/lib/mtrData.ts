import linesRaw from '../data/mtrLines.json'

export interface MtrStation {
  code: string
  nameTc: string
  nameEn: string
  seq: number
  lat: number | null
  lng: number | null
  interchange: string[]
}

export interface MtrLine {
  code: string
  nameTc: string
  nameEn: string
  color: string
  stations: MtrStation[]
}

export const MTR_LINES = linesRaw as MtrLine[]

// 站代碼 → 中文站名(跨線,供翻譯目的地)
export const stationNameTc: Record<string, string> = {}
for (const line of MTR_LINES) {
  for (const s of line.stations) stationNameTc[s.code] = s.nameTc
}

export const getLine = (code: string): MtrLine | undefined => MTR_LINES.find((l) => l.code === code)
