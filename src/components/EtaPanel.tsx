// 單一站嘅 ETA 面板:自己輪詢(路線頁展開車站用)。展示部分喺 EtaList。
import { useCallback, useEffect, useState } from 'react'
import { getEta, type Eta, type Route } from '../api/bus'
import { usePolling } from '../hooks/usePolling'
import { nextEtas } from '../lib/time'
import EtaList, { EtaSkeleton } from './EtaList'

const REFRESH_MS = 5_000

interface Props {
  route: Route
  stopId: string
}

export default function EtaPanel({ route, stopId }: Props) {
  const [etas, setEtas] = useState<Eta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setEtas(nextEtas(await getEta(route, stopId)))
      setUpdatedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [route, stopId])

  // 換咗站/路線 → 先出 skeleton
  useEffect(() => setLoading(true), [load])
  // 背景分頁自動暫停,返嚟即刻補一次
  usePolling(load, REFRESH_MS, { key: load })

  if (loading) return <EtaSkeleton />
  if (error) return <div className="eta-panel error">⚠️ {error}</div>
  return (
    <EtaList
      route={route}
      etas={etas}
      updatedAt={updatedAt}
      refreshSec={REFRESH_MS / 1000}
      onRefresh={load}
    />
  )
}
