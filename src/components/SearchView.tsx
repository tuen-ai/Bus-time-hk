// 搜尋分頁:營辦商 filter + 路線號 / 地名搜尋 + 首頁(推薦、公仔、收藏、集印卡)。
// 路線清單由 App 載入(其他分頁都要用),呢度只負責搜尋同顯示。
import { useMemo, useState } from 'react'
import {
  coClass,
  coLabel,
  CO_COLOR,
  missingOperators,
  SEARCH_OPERATORS,
  type Co,
  type Route,
} from '../api/bus'
import type { Favorite } from '../lib/store'
import { routeBadges } from '../lib/routeMeta'
import { searchRoutes } from '../lib/search'
import Favorites from './Favorites'
import SmartSuggest from './SmartSuggest'
import StampCard from './StampCard'
import { MascotState, MascotWelcome } from './Mascots'

interface Props {
  routes: Route[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpen: (r: Route, stopId?: string) => void
  onOpenFavorite: (f: Favorite) => void
}

/** 搵唔到時嘅提示:如果係某間營辦商資料攞唔到,講明白過叫人「試下轉 filter」 */
function emptyText(query: string): string {
  const miss = missingOperators()
  if (miss.length) {
    return `搵唔到「${query}」。${miss.map(coLabel).join('、')}嘅路線資料暫時載入唔到,撳一下重新整理再試~`
  }
  return `搵唔到「${query}」。可以打路線號(38、42C)、加營辦商(九巴38),或者打目的地(尖沙咀)~`
}

export default function SearchView({ routes, loading, error, onRetry, onOpen, onOpenFavorite }: Props) {
  const [query, setQuery] = useState('')
  const [coFilter, setCoFilter] = useState<Co | 'all'>('all')
  const matches = useMemo(() => searchRoutes(routes, query, coFilter), [routes, query, coFilter])
  const idle = !query && !loading

  return (
    <>
      <div className="co-filter">
        {(['all', ...SEARCH_OPERATORS] as (Co | 'all')[]).map((c) => {
          const active = coFilter === c
          const color = c === 'all' ? '#374151' : CO_COLOR[c]
          return (
            <button
              key={c}
              className={`co-chip ${active ? 'on' : ''}`}
              style={active ? { background: color, borderColor: color } : { color, borderColor: color }}
              onClick={() => setCoFilter(c)}
            >
              {c === 'all' ? '全部' : coLabel(c)}
            </button>
          )
        })}
      </div>

      <div className="search">
        <input
          type="search"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-label="搜尋路線號碼"
          placeholder="路線號碼或地方,例如 1A、269D、尖沙咀"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="clear" onClick={() => setQuery('')} aria-label="清除">
            ✕
          </button>
        )}
      </div>

      {loading && <MascotState mood="busy" text="熊貓幫緊你載入路線資料…" />}
      {error && (
        <div className="error pad">
          ⚠️ {error}{' '}
          <button className="refresh-btn" onClick={onRetry}>
            重試
          </button>
        </div>
      )}

      {idle && !error && (
        <>
          <SmartSuggest routes={routes} onOpen={onOpen} />
          <MascotWelcome title="今日去邊度呢? 💕" sub="輸入路線號碼,即刻睇到站時間~" />
        </>
      )}
      {idle && <Favorites onOpen={onOpenFavorite} />}
      {idle && !error && <StampCard />}

      {query && matches.length === 0 && !loading && <MascotState mood="sad" text={emptyText(query)} />}

      <div className="route-results">
        {matches.map((r, i) => (
          <button
            key={`${r.co}|${r.route}|${r.bound}|${r.service_type}|${r.uid ?? ''}|${i}`}
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
            <span className="chev">›</span>
          </button>
        ))}
      </div>
    </>
  )
}
