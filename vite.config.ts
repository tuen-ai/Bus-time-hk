import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base 設定為相對路徑,方便部署到 GitHub Pages / 任何子目錄
export default defineConfig({
  base: './',
  plugins: [react()],
})
