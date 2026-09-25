// 單一站嘅 ETA 面板:自己輪詢(路線頁展開車站用)。展示部分喺 EtaList。
// 網絡唔穩:保留上次成功嘅班次最多 5 分鐘(加細提示),從未成功過先顯示錯誤。
import { useCallback, useEffect, useRef, useState } from 'react'
import { getEta, type Route } from '../api/bus'
import { usePolling } from '../hooks/usePolling'
import { friendlyError } from '../lib/http'
import { ageSnapshot, keepStale, nextEtas, type EtaSnapshot } from '../lib/time'
import EtaList, { EtaError, EtaSkeleton } from './EtaList'

const REFRESH_MS = 5_000

interface Props {
  route: Route
  stopId: string
}

export default function EtaPanel({ route, stopId }: Props) {
  // null = 載入中(第一次 / 啱啱換站)
  const [snap, setSnap] = useState<EtaSnapshot | null>(null)
  // 每轉 load 一個號碼:換站後舊站遲返、或者撳刷新疊咗兩轉,都只認最新嗰轉
  const seqRef = useRef(0)

  const load = useCallback(async () => {
    const seq = ++seqRef.current
    // 背景分頁返嚟 / 斷咗網一排:等緊新資料嗰陣,走咗嘅車唔好照顯示,超過 5 分鐘唔再顯示舊班次
    const startedAt = Date.now()
    setSnap((prev) => ageSnapshot(prev, startedAt))
    try {
      const etas = await getEta(route, stopId)
      if (seq === seqRef.current) setSnap({ etas, fetchedAt: Date.now(), error: null })
    } catch (e) {
      if (seq !== seqRef.current) return
      // 唔好一失敗就清走班次(以前會喺舊資料同錯誤之間閃);每次都係新 object → 分鐘數照重計
      const error = friendlyError(e)
      const now = Date.now()
      setSnap((prev) => keepStale(prev, error, now))
    }
  }, [route, stopId])

  // 換咗站/路線 → 先出 skeleton,唔好將上個站嘅班次當「上次資料」
  useEffect(() => setSnap(null), [load])
  // 背景分頁自動暫停,返嚟即刻補一次
  usePolling(load, REFRESH_MS, { key: load })

  if (!snap) return <EtaSkeleton />
  if (snap.fetchedAt == null)
    return <EtaError message={snap.error ?? '載入失敗'} onRetry={() => void load()} />
  return (
    <EtaList
      route={route}
      etas={nextEtas(snap.etas)}
      updatedAt={snap.fetchedAt}
      stale={snap.error != null}
      refreshSec={REFRESH_MS / 1000}
      onRefresh={() => void load()}
    />
  )
}
