// 語音播報(Web Speech API,廣東話優先)。唔支援就靜默略過。
export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

export function speak(text: string): void {
  if (!speechSupported) return
  try {
    window.speechSynthesis.cancel() // 唔好疊聲
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-HK'
    u.rate = 0.95
    const voices = window.speechSynthesis.getVoices()
    const voice = voices.find((v) => /zh[-_]HK/i.test(v.lang)) ?? voices.find((v) => /^zh/i.test(v.lang))
    if (voice) u.voice = voice
    window.speechSynthesis.speak(u)
  } catch {
    /* 唔出聲都唔阻功能 */
  }
}
