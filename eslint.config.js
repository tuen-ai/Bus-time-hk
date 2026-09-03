// ESLint 9+ flat config:TypeScript + React hooks + Vite fast refresh。
// scripts/*.mjs 用 node globals;public/sw.js 用 service worker globals。
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/geom/**', 'public/tsm/**'] },

  // ---- app 原始碼 ----
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // 呢個 repo 慣用 `void promise` 表示刻意唔 await
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // 空 catch 好多時係刻意「靜默失敗」—— 要求留一句註解就得
      'no-empty': ['error', { allowEmptyCatch: true }],
      // react-hooks v7 新規則:effect 入面同步 setState。呢個 repo 嘅資料載入係
      // 「useEffect(() => { setLoading(true); fetch().then(setData) }, [deps]) 」pattern,
      // 屬於同步外部系統嘅正常用法;等遷移去 React 19 use() / suspense 先再開返。
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  // ---- 測試 ----
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // ---- build-time scripts(Node,JS)----
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      // _ 開頭 = 刻意唔用(例如 destructure 跳過)
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },

  // ---- config(Node,TS)----
  {
    files: ['vite.config.ts', 'vitest.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },

  // ---- service worker ----
  {
    files: ['public/sw.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.serviceworker,
    },
  },
)
