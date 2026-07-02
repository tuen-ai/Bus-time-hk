// 提示音 + 震動 + 通知(出門提醒/落車鬧鐘共用)。
// AudioContext 要喺用戶手勢入面初始化先出到聲 —— 設提醒嗰下 prime()。

let ctx: AudioContext | null = null

/** 喺用戶手勢(撳掣)時呼叫,預先解鎖音效 */
export function primeAudio(): void {
  try {
    type AC = typeof AudioContext
    const Ctor: AC | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext
    if (!Ctor) return
    if (!ctx) ctx = new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    /* 冇音效都唔阻功能 */
  }
}

/** 響鈴:三短一長嘟嘟聲 */
export function beep(): void {
  if (!ctx) return
  try {
    if (ctx.state === 'suspended') void ctx.resume()
    const t0 = ctx.currentTime
    const pattern = [0, 0.25, 0.5, 0.85]
    pattern.forEach((off, i) => {
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = i === 3 ? 1318 : 880 // 尾音高啲
      const start = t0 + off
      const dur = i === 3 ? 0.5 : 0.16
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(start)
      osc.stop(start + dur + 0.05)
    })
  } catch {
    /* ignore */
  }
}

export function vibrate(): void {
  try {
    navigator.vibrate?.([300, 120, 300, 120, 600])
  } catch {
    /* ignore */
  }
}

/** 攞通知權限(喺設提醒嘅手勢入面呼叫) */
export async function askNotify(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** 出通知:優先經 service worker(PWA/背景較可靠),fallback 直接 Notification */
export async function notify(title: string, body: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, { body, icon: './icon.svg', tag: 'kkcx' })
      return
    }
  } catch {
    /* fallthrough */
  }
  try {
    new Notification(title, { body, icon: './icon.svg' })
  } catch {
    /* ignore */
  }
}

/** 全套警示:震 + 響 + 通知 */
export function alertAll(title: string, body: string): void {
  vibrate()
  beep()
  void notify(title, body)
}

/** 倒數格式:>1h → "X小時Y分";>10min → "X分";否則 "M:SS" */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}小時${m}分`
  if (m >= 10) return `${m}分`
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
