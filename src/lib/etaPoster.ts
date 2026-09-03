// 畫「到站畫面」落 canvas,俾藍牙 e-ink 小屏(SKD-CLOCK)顯示。
// 純 2D 繪圖,唔識協議;driver 之後負責 resize+dither+上傳。
// e-ink 特性:得黑白(或黑白紅),所以全部粗體高對比、唔用幼線同灰階。
// 版面:三欄 —— 左路線牌、中目的地/站(超長截斷加…)、右分鐘大字。

export interface PosterRow {
  route: string
  dest: string
  stop: string
  mins: number[] // 已排序;空 = 冇班次
}

export interface PosterOpts {
  width: number
  height: number
  tri: boolean
  rows: PosterRow[]
  clock: string
  updatedLabel?: string
}

const BLACK = '#000'
const RED = '#e30000'
const WHITE = '#fff'
const FONT = 'system-ui, -apple-system, "PingFang HK", sans-serif'

const setFont = (ctx: CanvasRenderingContext2D, px: number, w = '800') => {
  ctx.font = `${w} ${px}px ${FONT}`
}

/** 截斷過長文字加「…」*/
const ellipsize = (ctx: CanvasRenderingContext2D, text: string, maxW: number) => {
  if (ctx.measureText(text).width <= maxW) return text
  let s = text
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1)
  return s + '…'
}

const rrect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

/** 路線號黑底白字牌;字體縮到入牌 */
const routeBadge = (
  ctx: CanvasRenderingContext2D,
  route: string,
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  ctx.fillStyle = BLACK
  rrect(ctx, x, y, w, h, h * 0.22)
  ctx.fill()
  let fs = Math.round(h * 0.6)
  setFont(ctx, fs)
  while (fs > 8 && ctx.measureText(route).width > w * 0.86) {
    fs -= 1
    setFont(ctx, fs)
  }
  ctx.fillStyle = WHITE
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(route, x + w / 2, y + h / 2 + h * 0.02)
}

/**
 * 分鐘大字 + 後備班次,右對齊喺 [rightX-zoneW, rightX] 之內。
 * 回傳佢實際佔用嘅最左 x(俾中欄避開)。
 */
const minutesBlock = (
  ctx: CanvasRenderingContext2D,
  mins: number[],
  tri: boolean,
  rightX: number,
  cy: number,
  bigPx: number,
): number => {
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  if (mins.length === 0) {
    ctx.fillStyle = BLACK
    const fs = Math.round(bigPx * 0.5)
    setFont(ctx, fs)
    const t = '冇班次'
    ctx.fillText(t, rightX, cy + fs * 0.35)
    return rightX - ctx.measureText(t).width
  }
  const m0 = mins[0]
  const urgent = m0 <= 3
  const head = m0 <= 0 ? '即' : String(m0)
  const unit = m0 <= 0 ? '將' : '分'
  const unitPx = Math.round(bigPx * 0.44)
  ctx.fillStyle = tri && urgent ? RED : BLACK
  setFont(ctx, unitPx)
  const unitW = ctx.measureText(unit).width
  ctx.fillText(unit, rightX, cy)
  setFont(ctx, bigPx)
  const headW = ctx.measureText(head).width
  ctx.fillText(head, rightX - unitW - bigPx * 0.05, cy)
  let leftmost = rightX - unitW - bigPx * 0.05 - headW
  if (mins.length > 1) {
    const rest = mins
      .slice(1, 3)
      .map((m) => `${m}分`)
      .join('  ')
    ctx.fillStyle = BLACK
    const fs = Math.round(bigPx * 0.34)
    setFont(ctx, fs, '700')
    ctx.textAlign = 'right'
    ctx.fillText(rest, rightX, cy + fs * 1.35)
    leftmost = Math.min(leftmost, rightX - ctx.measureText(rest).width)
  }
  return leftmost
}

export function renderEtaPoster(canvas: HTMLCanvasElement, opts: PosterOpts) {
  const { width: W, height: H, tri, rows, clock, updatedLabel } = opts
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = WHITE
  ctx.fillRect(0, 0, W, H)
  ctx.imageSmoothingEnabled = true

  // ── 頂條:時鐘 + 標題 ──
  const topH = Math.round(H * 0.18)
  ctx.fillStyle = BLACK
  ctx.fillRect(0, 0, W, topH)
  ctx.fillStyle = WHITE
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  setFont(ctx, Math.round(topH * 0.66))
  ctx.fillText(clock, Math.round(W * 0.03), topH / 2 + 1)
  ctx.textAlign = 'right'
  setFont(ctx, Math.round(topH * 0.46), '700')
  const title = updatedLabel ? `可可出行 · ${updatedLabel}` : '可可出行'
  ctx.fillText(ellipsize(ctx, title, W * 0.6), W - Math.round(W * 0.03), topH / 2 + 1)

  const bodyY = topH
  const bodyH = H - topH
  const list = rows.slice(0, 2)
  const pad = Math.round(W * 0.03)

  if (list.length === 0) {
    ctx.fillStyle = BLACK
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    setFont(ctx, Math.round(bodyH * 0.2))
    ctx.fillText('未有收藏路線', W / 2, bodyY + bodyH / 2)
    return
  }

  const single = list.length === 1
  const rowH = bodyH / list.length
  const gap = Math.round(W * 0.025)

  list.forEach((r, i) => {
    const y0 = bodyY + i * rowH
    if (i > 0) {
      ctx.strokeStyle = BLACK
      ctx.lineWidth = Math.max(1, Math.round(H * 0.01))
      ctx.beginPath()
      ctx.moveTo(pad, y0)
      ctx.lineTo(W - pad, y0)
      ctx.stroke()
    }

    // 左:路線牌
    const badgeH = Math.round(rowH * (single ? 0.46 : 0.58))
    const badgeW = Math.round(W * (single ? 0.3 : 0.27))
    const badgeY = y0 + Math.round((rowH - badgeH) / 2)
    routeBadge(ctx, r.route, pad, badgeY, badgeW, badgeH)

    // 右:分鐘(先畫,攞返佔用左界)
    const bigPx = Math.round(rowH * (single ? 0.46 : 0.44))
    const minCy = y0 + rowH * (single ? 0.52 : 0.44)
    const minLeft = minutesBlock(ctx, r.mins, tri, W - pad, minCy, bigPx)

    // 中:目的地 + 站(避開分鐘,超長截斷)
    const infoX = pad + badgeW + gap
    const infoW = Math.max(20, minLeft - gap - infoX)
    ctx.fillStyle = BLACK
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const destPx = Math.round(rowH * (single ? 0.2 : 0.26))
    setFont(ctx, destPx)
    const destBase = y0 + rowH * (single ? 0.4 : 0.44)
    ctx.fillText(ellipsize(ctx, `往${r.dest}`, infoW), infoX, destBase)
    const stopPx = Math.round(rowH * (single ? 0.15 : 0.2))
    setFont(ctx, stopPx, '600')
    ctx.fillText(ellipsize(ctx, r.stop, infoW), infoX, destBase + stopPx * 1.45)
  })
}
