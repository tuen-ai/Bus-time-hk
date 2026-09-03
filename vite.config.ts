import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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

/** 將 public/sw.js 入面嘅 __BUILD_ID__ 換成今次 build 嘅 sha → 每次部署 SW cache 自動換新 */
function swBuildId(): Plugin {
  return {
    name: 'sw-build-id',
    apply: 'build',
    closeBundle() {
      const sw = fileURLToPath(new URL('./dist/sw.js', import.meta.url))
      if (!existsSync(sw)) return
      writeFileSync(sw, readFileSync(sw, 'utf8').replace(/__BUILD_ID__/g, buildId()))
    },
  }
}

// base 設定為相對路徑,方便部署到 GitHub Pages / 任何子目錄
export default defineConfig({
  base: './',
  plugins: [react(), swBuildId()],
  build: {
    // planGraph.json(規劃離線圖 ~2MB)係刻意獨立 chunk、idle 先預載;唔使每次 build 都警告
    chunkSizeWarningLimit: 2200,
  },
})
