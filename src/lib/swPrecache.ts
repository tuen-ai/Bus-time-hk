// build 時(vite.config.ts 嘅 sw-precache plugin)用:由今次 build 嘅輸出砌 service worker 預載清單,
// 再寫入 public/sw.js 嘅 placeholder。純字串處理,app 冇 import,唔會打包;抽出嚟係為咗寫單元測試。

export interface BuiltFile {
  /** 相對 dist,例如 'assets/index-Bx1.js' */
  fileName: string
  /** bytes */
  size: number
}

/** 大過呢個 size 嘅 chunk 唔預載:用到先 cache,之後跨版本帶過去 */
export const PRECACHE_MAX_BYTES = 1_000_000

/** 點都唔預載(就算將來縮細咗):規劃圖只係「規劃」同「附近」城巴/綠van 用到先載,唔好第一次開 app 就喺背景下載 */
export const NEVER_PRECACHE = /\/planGraph-[^/]*\.js$/

export interface SwLists {
  /** install 時一定要攞齊:外殼('./' = index.html)+ public 檔 + 今次 build 嘅 JS/CSS */
  precache: string[]
  /** assets/ 全部檔名(包括唔預載嘅大檔):SW 用嚟對 index.html 同帶走舊版 cache */
  assets: string[]
}

/** shell:public/ 入面要離線用嘅檔(例如 manifest、icon),由 caller 確認存在先傳入 */
export function precacheLists(
  files: BuiltFile[],
  shell: string[] = [],
  maxBytes = PRECACHE_MAX_BYTES,
): SwLists {
  const hashed = files.filter((f) => f.fileName.startsWith('assets/'))
  const code = hashed
    .filter((f) => /\.(js|css)$/.test(f.fileName) && f.size <= maxBytes && !NEVER_PRECACHE.test(f.fileName))
    .map((f) => `./${f.fileName}`)
    .sort()
  return {
    precache: ['./', ...shell.map((f) => `./${f}`), ...code],
    assets: hashed.map((f) => f.fileName).sort(),
  }
}

// prettier 會將 /*__X__*/['./'] 排成 /* __X__ */ ['./'] → 用寬鬆 regex
const slot = (name: string) => new RegExp(`/\\*\\s*${name}\\s*\\*/\\s*\\[[^\\]]*\\]`)

/** 將 sw.js 嘅 __BUILD_ID__ 同 /* __PRECACHE__ *\/ [...]、/* __ASSETS__ *\/ [...] 換走;搵唔到 placeholder 就 throw(寧可 build 失敗都唔好靜靜雞冇預載) */
export function injectSw(src: string, buildId: string, lists: SwLists): string {
  let out = src.replace(/__BUILD_ID__/g, buildId)
  for (const [name, list] of [
    ['__PRECACHE__', lists.precache],
    ['__ASSETS__', lists.assets],
  ] as const) {
    const re = slot(name)
    if (!re.test(out)) throw new Error(`public/sw.js 搵唔到 /* ${name} */ [] placeholder`)
    out = out.replace(re, () => JSON.stringify(list)) // function replacer:檔名有 $ 都唔會出事
  }
  return out
}
