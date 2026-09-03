import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 單元測試:jsdom(hooks / localStorage / history 都有),只跑 src/**/*.test.ts(x)
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
  },
})
