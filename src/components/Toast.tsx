import { useSyncExternalStore } from 'react'
import { getToast, subscribeToast } from '../lib/toast'

/** 底部細提示;live region 一開始就要喺度,讀屏先會讀出之後出現嘅字 */
export default function Toast() {
  const t = useSyncExternalStore(subscribeToast, getToast)
  return (
    <div className="mini-toast-region" role="status" aria-live="polite">
      {t && (
        <div key={t.id} className="mini-toast">
          {t.text}
        </div>
      )}
    </div>
  )
}
