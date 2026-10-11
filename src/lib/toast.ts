// 細提示(「已複製連結」、「連結無效」):一個全域 store,任何地方 showToast,<Toast /> 顯示
type Listener = () => void
let current: { id: number; text: string } | null = null
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<Listener>()
const emit = () => listeners.forEach((l) => l())

export const TOAST_MS = 2500

export function showToast(text: string, ms = TOAST_MS): void {
  current = { id: ++seq, text }
  clearTimeout(timer)
  timer = setTimeout(() => {
    current = null
    emit()
  }, ms)
  emit()
}

export const getToast = () => current
export function subscribeToast(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
