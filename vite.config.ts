import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { injectSw, precacheLists } from './src/lib/swPrecache'

/** build 識別碼:git short sha;冇 git(例如 zip 落嚟 build)就用時間戳 */
function buildId(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return String(Date.now())
  }
}

/**
 * 改寫 dist/sw.js:__BUILD_ID__ 換成今次 build 嘅 sha(每次部署 SW cache 自動換新),
 * 再寫入預載清單(外殼 + 今次 build 嘅 JS/CSS)→ 裝完 SW 第一次離線開都唔會白畫面。
 */
function swPrecache(): Plugin {
  return {
    name: 'sw-precache',
    apply: 'build',
    writeBundle(options, bundle) {
      const dir = options.dir ?? fileURLToPath(new URL('./dist', import.meta.url))
      const sw = join(dir, 'sw.js')
      if (!existsSync(sw)) return
      const files = Object.values(bundle).map((f) => ({
        fileName: f.fileName,
        size: Buffer.byteLength(f.type === 'chunk' ? f.code : f.source),
      }))
      // public/ 入面離線要用嘅檔(存在先放,唔係 install 會 404 失敗)
      const shell = ['manifest.webmanifest', 'icon.svg'].filter((f) => existsSync(join(dir, f)))
      writeFileSync(sw, injectSw(readFileSync(sw, 'utf8'), buildId(), precacheLists(files, shell)))
    },
  }
}

// base 設定為相對路徑,方便部署到 GitHub Pages / 任何子目錄
export default defineConfig({
  base: './',
  // 大 JSON(planGraph 2MB、gmbData…)出 JSON.parse("…") 而唔係 JS object literal:parse 快幾倍
  // (src 入面全部 JSON import 都只用 default export)
  json: { stringify: true },
  plugins: [react(), swPrecache()],
  build: {
    // planGraph.json(規劃離線圖 ~2MB)係刻意獨立 chunk、idle 先預載;唔使每次 build 都警告
    chunkSizeWarningLimit: 2200,
    rollupOptions: {
      output: {
        // React 獨立 chunk:改 app code 唔會令佢換 hash,SW / HTTP cache 可以跨版本沿用
        manualChunks: { react: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
      },
    },
  },
})
