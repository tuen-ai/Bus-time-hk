// 長草顏團子公仔素材:只供本機預覽,唔入 git(見 public/mascots/README.md 版權說明)。
// 用法:node scripts/fetch-kaodango.mjs → 寫 public/mascots/kaodango-<pose>.webp + -still.png
// 冇呢啲檔,app 揀咗團子都會自動退返熊貓 / 啡熊。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 來源:Tenor(用家上載,非官方)。page = 原頁面,anim = 動態 webp,still = Tenor 靜態預覽
export const KAODANGO = {
  wave: {
    page: 'https://tenor.com/view/budding-pop-cute-adorable-blush-leaf-gif-15514789',
    anim: 'https://media.tenor.com/DcDYpWonGbIAAAAx/budding-pop-cute.webp',
    still: 'https://media.tenor.com/DcDYpWonGbIAAAAe/budding-pop-cute.png',
  },
  dance: {
    page: 'https://tenor.com/view/leaf-budding-pop-dancing-left-and-right-cute-gif-15514752',
    anim: 'https://media.tenor.com/NynQPGT5LbsAAAAx/leaf-budding-pop.webp',
    still: 'https://media.tenor.com/NynQPGT5LbsAAAAe/leaf-budding-pop.png',
  },
  cry: {
    page: 'https://tenor.com/view/budding-pop-leaf-crying-tears-sad-gif-15515903',
    anim: 'https://media.tenor.com/BIi0LzhT14gAAAAx/budding-pop-leaf.webp',
    still: 'https://media.tenor.com/BIi0LzhT14gAAAAe/budding-pop-leaf.png',
  },
  sleepy: {
    page: 'https://tenor.com/view/budding-pop-leaf-yawn-sleepy-cute-gif-15514705',
    anim: 'https://media.tenor.com/8MR4nJ4BEzQAAAAx/budding-pop-leaf.webp',
    still: 'https://media.tenor.com/8MR4nJ4BEzQAAAAe/budding-pop-leaf.png',
  },
}

const MAX = 300 * 1024
const dir = fileURLToPath(new URL('../public/mascots/', import.meta.url))
mkdirSync(dir, { recursive: true })
for (const [pose, src] of Object.entries(KAODANGO)) {
  for (const [kind, url, name] of [
    ['anim', src.anim, `kaodango-${pose}.webp`],
    ['still', src.still, `kaodango-${pose}-still.png`],
  ]) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${pose} ${kind}: HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX) throw new Error(`${name} 太大(${buf.length} bytes)`)
    writeFileSync(join(dir, name), buf)
    console.log(`${name}\t${(buf.length / 1024).toFixed(1)} KB`)
  }
}
