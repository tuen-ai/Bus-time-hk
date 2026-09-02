import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base 設定為相對路徑,方便部署到 GitHub Pages / 任何子目錄
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // planGraph.json(規劃離線圖 ~2MB)係刻意獨立 chunk、idle 先預載;唔使每次 build 都警告
    chunkSizeWarningLimit: 2200,
  },
})
