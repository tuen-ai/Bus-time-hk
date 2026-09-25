import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { injectSw, precacheLists, PRECACHE_MAX_BYTES } from './swPrecache'

const files = [
  { fileName: 'index.html', size: 1500 },
  { fileName: 'assets/index-AAA.js', size: 280_000 },
  { fileName: 'assets/index-CCC.css', size: 47_000 },
  { fileName: 'assets/react-RRR.js', size: 140_000 },
  { fileName: 'assets/MtrView-M1.js', size: 5_000 },
  { fileName: 'assets/planGraph-PG.js', size: 2_263_557 },
  { fileName: 'assets/logo-L1.png', size: 3_000 },
]

describe('precacheLists', () => {
  it('外殼 + 今次 build 嘅 JS/CSS;超大 chunk(planGraph)唔預載', () => {
    const { precache } = precacheLists(files, ['manifest.webmanifest', 'icon.svg'])
    expect(precache).toEqual([
      './',
      './manifest.webmanifest',
      './icon.svg',
      './assets/MtrView-M1.js',
      './assets/index-AAA.js',
      './assets/index-CCC.css',
      './assets/react-RRR.js',
    ])
    expect(precache).not.toContain('./assets/planGraph-PG.js')
    expect(precache).not.toContain('./index.html')
  })

  it('assets 清單包晒 assets/ 全部檔(大檔都要,SW 用嚟帶走舊 cache 同核對 index.html)', () => {
    const { assets } = precacheLists(files)
    expect(assets).toEqual([
      'assets/MtrView-M1.js',
      'assets/index-AAA.js',
      'assets/index-CCC.css',
      'assets/logo-L1.png',
      'assets/planGraph-PG.js',
      'assets/react-RRR.js',
    ])
  })

  it('size 門檻可以調,但規劃圖點都唔預載', () => {
    expect(PRECACHE_MAX_BYTES).toBeLessThan(2_263_557)
    const { precache } = precacheLists(files, [], 3_000_000)
    // 規劃圖點都唔預載(就算上限放寬 / 將來縮細咗)
    expect(precache).not.toContain('./assets/planGraph-PG.js')
  })
})

describe('injectSw', () => {
  const lists = { precache: ['./', './assets/a-1.js'], assets: ['assets/a-1.js', 'assets/big-$&.js'] }

  it('換 build id 同兩個清單(prettier 排版後嘅 placeholder 都認得)', () => {
    const src = [
      "const CACHE = 'kmb-eta-__BUILD_ID__'",
      "const PRECACHE = /* __PRECACHE__ */ ['./']",
      'const ASSETS = /*__ASSETS__*/[]',
    ].join('\n')
    const out = injectSw(src, 'abc1234', lists)
    expect(out).toContain("const CACHE = 'kmb-eta-abc1234'")
    expect(out).toContain('const PRECACHE = ["./","./assets/a-1.js"]')
    // 檔名有 $& 都唔會俾 String.replace 當特殊 pattern
    expect(out).toContain('const ASSETS = ["assets/a-1.js","assets/big-$&.js"]')
  })

  it('搵唔到 placeholder 就 throw(唔好靜靜雞冇預載)', () => {
    expect(() => injectSw("const PRECACHE = ['./']\nconst ASSETS = []", 'x', lists)).toThrow(/__PRECACHE__/)
    expect(() => injectSw("const PRECACHE = /* __PRECACHE__ */ ['./']", 'x', lists)).toThrow(/__ASSETS__/)
  })

  it('真正嘅 public/sw.js 有齊 placeholder,注入後係合法 JS', () => {
    const src = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')
    const out = injectSw(src, 'deadbee', lists)
    expect(out).not.toMatch(/__BUILD_ID__|__PRECACHE__|__ASSETS__/)
    expect(out).toContain('const PRECACHE = ["./","./assets/a-1.js"]')
    // 語法檢查:用 Function 包住 parse 一次(唔執行)
    expect(() => new Function(out)).not.toThrow()
  })
})
