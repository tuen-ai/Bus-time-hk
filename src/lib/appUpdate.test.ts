import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 模組入面有狀態(reloading / updateReady)→ 每個測試重新 import 一份新嘅
const load = async () => {
  vi.resetModules()
  return import('./appUpdate')
}

const SHELL = `<!doctype html><html><head>
<script type="module" crossorigin src="./assets/index-AAA.js"></script>
<link rel="modulepreload" crossorigin href="./assets/react-RRR.js">
<link rel="stylesheet" crossorigin href="./assets/index-CCC.css">
<link rel="manifest" href="./manifest.webmanifest" />
</head><body><div id="root"></div></body></html>`

beforeEach(() => {
  sessionStorage.clear()
  document.head.innerHTML = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reloadOnce', () => {
  it('第一次會 reload,10 分鐘內唔會再 reload(防 loop)', async () => {
    const { reloadOnce, isReloading } = await load()
    const reload = vi.fn()
    expect(reloadOnce(reload, 1_000_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(isReloading()).toBe(true)

    // 新頁面(模組狀態清咗),sessionStorage 仲記得
    const fresh = await load()
    const reload2 = vi.fn()
    expect(fresh.reloadOnce(reload2, 1_000_000 + 5 * 60_000)).toBe(false)
    expect(reload2).not.toHaveBeenCalled()
    expect(fresh.isReloading()).toBe(false)
  })

  it('過咗 10 分鐘又可以自救一次', async () => {
    const { reloadOnce, AUTO_RELOAD_GAP_MS } = await load()
    reloadOnce(vi.fn(), 1_000_000)
    const next = await load()
    const reload = vi.fn()
    expect(next.reloadOnce(reload, 1_000_000 + AUTO_RELOAD_GAP_MS)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('同一頁 reload 緊就唔會再 call 多次', async () => {
    const { reloadOnce } = await load()
    const reload = vi.fn()
    reloadOnce(reload, 1)
    expect(reloadOnce(reload, 2)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('時鐘倒退(上次時間喺未來)唔會永遠鎖死', async () => {
    sessionStorage.setItem('kkcx.autoReloadAt', String(9_000_000))
    const { reloadOnce } = await load()
    const reload = vi.fn()
    expect(reloadOnce(reload, 1_000)).toBe(true)
  })

  it('sessionStorage 用唔到 → 唔冒險自動 reload', async () => {
    const { reloadOnce } = await load()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const reload = vi.fn()
    expect(reloadOnce(reload, 1)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('isChunkError', () => {
  it('認得各瀏覽器嘅 dynamic import 失敗', async () => {
    const { isChunkError } = await load()
    expect(
      isChunkError(
        new TypeError('Failed to fetch dynamically imported module: https://x/assets/MtrView-1.js'),
      ),
    ).toBe(true)
    expect(isChunkError(new TypeError('error loading dynamically imported module'))).toBe(true) // Firefox
    expect(isChunkError(new TypeError('Importing a module script failed.'))).toBe(true) // Safari
    expect(isChunkError(new Error('Unable to preload CSS for /assets/RouteMap-1.css'))).toBe(true)
    expect(isChunkError('Failed to fetch dynamically imported module')).toBe(true)
  })

  it('普通 bug / 網絡錯誤唔當 chunk 錯', async () => {
    const { isChunkError } = await load()
    expect(isChunkError(new TypeError("Cannot read properties of undefined (reading 'eta')"))).toBe(false)
    expect(isChunkError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isChunkError(null)).toBe(false)
    expect(isChunkError({})).toBe(false)
  })
})

describe('新版本狀態', () => {
  it('markUpdateReady 通知訂閱者同 window event,只會通知一次', async () => {
    const { markUpdateReady, isUpdateReady, onUpdateReady, UPDATE_EVENT } = await load()
    const cb = vi.fn()
    const onEvent = vi.fn()
    window.addEventListener(UPDATE_EVENT, onEvent)
    const off = onUpdateReady(cb)
    expect(isUpdateReady()).toBe(false)
    markUpdateReady()
    markUpdateReady()
    expect(isUpdateReady()).toBe(true)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledTimes(1)
    off()
    window.removeEventListener(UPDATE_EVENT, onEvent)
  })

  it('取消訂閱之後唔再通知', async () => {
    const { markUpdateReady, onUpdateReady } = await load()
    const cb = vi.fn()
    onUpdateReady(cb)()
    markUpdateReady()
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('shellAssets / isSameBuild', () => {
  it('抽出 index.html 引用嘅 assets(唔包 manifest)', async () => {
    const { shellAssets } = await load()
    expect(shellAssets(SHELL)).toEqual(['assets/index-AAA.js', 'assets/react-RRR.js', 'assets/index-CCC.css'])
  })

  it('頁面已經載咗新外殼全部 assets(絕對網址 + 之後 lazy 加嘅)= 同一個 build', async () => {
    const { isSameBuild } = await load()
    const page = [
      'https://u.github.io/Bus-time-hk/assets/index-AAA.js',
      './assets/react-RRR.js',
      './assets/index-CCC.css',
      './assets/MtrView-XYZ.js',
    ]
    expect(isSameBuild(SHELL, page)).toBe(true)
  })

  it('JS 或者淨係 CSS 換咗 hash 都當新版', async () => {
    const { isSameBuild } = await load()
    expect(
      isSameBuild(SHELL, ['./assets/index-OLD.js', './assets/react-RRR.js', './assets/index-CCC.css']),
    ).toBe(false)
    expect(
      isSameBuild(SHELL, ['./assets/index-AAA.js', './assets/react-RRR.js', './assets/index-OLD.css']),
    ).toBe(false)
  })

  it('外殼抽唔到 assets(dev)就當唔同,寧可提示', async () => {
    const { isSameBuild } = await load()
    expect(isSameBuild('<script type="module" src="/src/main.tsx"></script>', ['/src/main.tsx'])).toBe(false)
  })
})

describe('checkForNewBuild', () => {
  const pageWith = (...srcs: string[]) => {
    for (const src of srcs) {
      const s = document.createElement('script')
      s.type = 'module'
      s.setAttribute('src', src)
      document.head.appendChild(s)
    }
  }

  it('頁面已經係新 build → 唔提示', async () => {
    const m = await load()
    pageWith('./assets/index-AAA.js', './assets/react-RRR.js')
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.setAttribute('href', './assets/index-CCC.css')
    document.head.appendChild(link)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(SHELL)),
    )
    await m.checkForNewBuild('./')
    expect(m.isUpdateReady()).toBe(false)
  })

  it('頁面係舊 build → 提示', async () => {
    const m = await load()
    pageWith('./assets/index-OLD.js')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(SHELL)),
    )
    await m.checkForNewBuild('./')
    expect(m.isUpdateReady()).toBe(true)
  })

  it('攞唔到外殼 → 照提示(reload 冇壞)', async () => {
    const m = await load()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await m.checkForNewBuild('./')
    expect(m.isUpdateReady()).toBe(true)
  })
})

describe('runningBuildGone', () => {
  const withEntry = () => {
    const s = document.createElement('script')
    s.type = 'module'
    s.src = 'https://u.github.io/app/assets/index-OLD.js'
    document.head.appendChild(s)
  }

  it('entry script 404 = 已部署新版', async () => {
    const m = await load()
    withEntry()
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await m.runningBuildGone()).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://u.github.io/app/assets/index-OLD.js',
      expect.objectContaining({ method: 'HEAD', cache: 'no-store' }),
    )
  })

  it('entry 仲喺度 / 網絡失敗 / 冇 entry → 唔肯定,唔 reload', async () => {
    const m = await load()
    expect(await m.runningBuildGone()).toBe(false) // 冇 entry script
    withEntry()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    )
    expect(await m.runningBuildGone()).toBe(false)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    expect(await m.runningBuildGone()).toBe(false)
  })
})
