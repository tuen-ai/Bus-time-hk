// 搜尋分頁:營辦商 filter + 路線號 / 地名搜尋 + 首頁(推薦、公仔、收藏、集印卡)。
// 路線清單由 App 載入(其他分頁都要用),呢度只負責搜尋同顯示。
// query / filter 由 App 保管 —— 開路線再返嚟唔使重打。
import { Suspense, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  coClass,
  coLabel,
  CO_COLOR,
  missingOperators,
  SEARCH_OPERATORS,
  type Co,
  type Route,
} from '../api/bus'
import { FAVS_CHANGED, getFavorites, type Favorite } from '../lib/store'
// 輕量版(唔帶站表):首屏淨係要知有冇港鐵收藏
import { hasMtrFavs, MTRFAVS_CHANGED } from '../lib/mtrFavsStore'
import { routeBadges } from '../lib/routeMeta'
import { resultKeys, routeIdentity, searchRoutes } from '../lib/search'
import { lazyRetry } from '../lib/lazyRetry'
import Favorites from './Favorites'
import SmartSuggest from './SmartSuggest'
import StampCard from './StampCard'
import { MascotGreeting, MascotState, MascotWelcome } from './Mascots'

// 港鐵收藏卡連埋成份綫站表(~20KB):有港鐵收藏先載,唔入首屏 bundle
const MtrFavorites = lazyRetry(() => import('./MtrFavorites'))

interface Props {
  routes: Route[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpen: (r: Route, stopId?: string) => void
  onOpenFavorite: (f: Favorite) => void
  /** 首頁港鐵收藏 → 開鐵路頁嗰條綫 + 嗰個站 */
  onOpenMtr: (line: string, sta: string) => void
  query: string
  onQuery: (q: string) => void
  coFilter: Co | 'all'
  onCoFilter: (c: Co | 'all') => void
  /** 由路線頁返嚟:將焦點放返上次撳嘅結果卡(routeIdentity) */
  focusKey?: string | null
  onFocusDone?: () => void
}

/** 搵唔到時嘅提示:如果係某間營辦商資料攞唔到,講明白過叫人「試下轉 filter」 */
function emptyText(query: string): string {
  const miss = missingOperators()
  if (miss.length) {
    return `搵唔到「${query}」。${miss.map(coLabel).join('、')}嘅路線資料暫時載入唔到,撳一下重新整理再試~`
  }
  return `搵唔到「${query}」。可以打路線號(38、42C)、加營辦商(九巴38),或者打目的地(尖沙咀)~`
}

// 港鐵收藏都算收藏:有任何一種就用熟客排法(收藏排最前)
const hasFavorites = () => getFavorites().length > 0 || hasMtrFavs()

export default function SearchView({
  routes,
  loading,
  error,
  onRetry,
  onOpen,
  onOpenFavorite,
  onOpenMtr,
  query,
  onQuery,
  coFilter,
  onCoFilter,
  focusKey,
  onFocusDone,
}: Props) {
  // 打字即刻出字;搜尋 + 排 200 張卡可以遲少少(慢機唔會 lag 住個輸入框)
  const dq = useDeferredValue(query)
  const matches = useMemo(() => searchRoutes(routes, dq, coFilter), [routes, dq, coFilter])
  const keys = useMemo(() => resultKeys(matches), [matches])
  const idle = !query && !loading
  // 收藏唔使等路線清單:清單載緊(慢網 /route/CTB 可以等成 30 秒)都照出
  const favsOn = !query
  // 啱啱清咗 query 但 dq 仲係舊值 → 唔好喺首頁下面閃返舊結果
  const list = !query && dq ? [] : matches
  // dq 未追上 query 時 matches 仲係上一個字嘅 → 唔好閃「搵唔到」
  const settled = dq === query

  // 有冇收藏決定首頁排法(設定改次序 / 其他分頁改咗都會通知)。
  // 港鐵收藏卡要自己一個 state:已經有巴士收藏再加第一個港鐵收藏,hasFavs 唔會變
  const [hasFavs, setHasFavs] = useState(hasFavorites)
  const [hasMtr, setHasMtr] = useState(hasMtrFavs)
  useEffect(() => {
    const onChange = () => {
      setHasFavs(hasFavorites())
      setHasMtr(hasMtrFavs())
    }
    window.addEventListener(FAVS_CHANGED, onChange)
    window.addEventListener(MTRFAVS_CHANGED, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(FAVS_CHANGED, onChange)
      window.removeEventListener(MTRFAVS_CHANGED, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  // 由路線頁返嚟:焦點返去嗰張卡(鍵盤 / 讀屏唔會跌返去頁頂)
  const resultsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focusKey) return
    const cards = resultsRef.current?.querySelectorAll<HTMLElement>('[data-rid]') ?? []
    const el = Array.from(cards).find((c) => c.dataset.rid === focusKey)
    if (el) {
      el.focus({ preventScroll: true })
      el.scrollIntoView?.({ block: 'center' })
    }
    onFocusDone?.()
  }, [focusKey, onFocusDone])

  const inputRef = useRef<HTMLInputElement>(null)
  // 移除咗最後一個港鐵收藏(成個區消失):焦點返去搜尋區,唔好跌落 body(唔 focus 輸入框,手機會彈鍵盤)
  const searchRef = useRef<HTMLDivElement>(null)
  const onMtrEmpty = () => searchRef.current?.focus({ preventScroll: true })
  const clear = () => {
    onQuery('')
    inputRef.current?.focus() // ✕ 會消失,焦點唔好跌去 body
  }

  const home = idle && !error

  return (
    <>
      <div className="co-filter" role="group" aria-label="營辦商篩選">
        {(['all', ...SEARCH_OPERATORS] as (Co | 'all')[]).map((c) => {
          const active = coFilter === c
          // 品牌色經 --co 交俾 CSS,由 CSS 按深淺色主題揀可讀嘅字色
          const color = c === 'all' ? '#374151' : CO_COLOR[c]
          return (
            <button
              key={c}
              type="button"
              className={`co-chip ${active ? 'on' : ''}`}
              style={{ '--co': color } as CSSProperties}
              aria-pressed={active}
              onClick={() => onCoFilter(c)}
            >
              {c === 'all' ? '全部' : coLabel(c)}
            </button>
          )
        })}
      </div>

      <div className="search" role="search" ref={searchRef} tabIndex={-1}>
        <input
          ref={inputRef}
          type="search"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-label="搜尋路線號碼或地方"
          placeholder="路線號碼或地方,例如 1A、269D、尖沙咀"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="clear" onClick={clear} aria-label="清除搜尋">
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>

      {loading && <MascotState mood="busy" text="熊貓幫緊你載入路線資料…" />}
      {error && (
        <div className="error pad search-error" role="alert">
          <span aria-hidden="true">⚠️ </span>
          {error}{' '}
          <button type="button" className="preset-chip" onClick={onRetry}>
            重試
          </button>
        </div>
      )}

      {/* 有收藏:細問候 + 收藏排最前;新用戶先見大公仔 hero */}
      {home && hasFavs && <MascotGreeting />}
      {favsOn && hasFavs && <Favorites onOpen={onOpenFavorite} />}
      {/* 港鐵收藏緊貼巴士收藏;唔使等巴士路線清單 */}
      {favsOn && hasMtr && (
        <Suspense fallback={null}>
          <MtrFavorites onOpen={onOpenMtr} onEmpty={onMtrEmpty} />
        </Suspense>
      )}
      {home && <SmartSuggest routes={routes} onOpen={onOpen} />}
      {home && !hasFavs && <MascotWelcome title="今日去邊度呢? 💕" sub="輸入路線號碼,即刻睇到站時間~" />}
      {favsOn && !hasFavs && <Favorites onOpen={onOpenFavorite} />}
      {home && <StampCard />}

      {query && settled && matches.length === 0 && !loading && (
        <MascotState mood="sad" text={emptyText(query)} />
      )}

      <div className="route-results" ref={resultsRef}>
        {list.map((r, i) => (
          <button
            key={keys[i]}
            type="button"
            data-rid={routeIdentity(r)}
            className="route-card"
            onClick={() => onOpen(r)}
          >
            <span className={`route-badge ${coClass(r.co)}`}>{r.route}</span>
            <span className="route-line">
              <span className="route-dest-line">
                <span className={`tag tag-co tag-${r.co}`}>{coLabel(r.co)}</span>
                <span className="muted small">往</span>
                <span className="route-dest-name">{r.dest_tc}</span>
                {routeBadges(r.route, r.service_type).map((b) => (
                  <span key={b.kind} className={`tag tag-${b.kind}`}>
                    {b.label}
                  </span>
                ))}
              </span>
              <span className="muted small route-orig">由 {r.orig_tc}</span>
            </span>
            <span className="chev" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
