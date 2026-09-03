// SKD-CLOCK 藍牙 e-ink 小屏驅動(Web Bluetooth)。
// 協議 100% 對照 tuen-ai/clockapp 嘅 index.html 源碼(唔係 PROTOCOL.md,因 doc 有誤)。
// 只做需要嘅:連線、讀狀態(解像度/色彩/電量/槽位)、對時、上圖、顯示。
//
// ⚠️ Web Bluetooth 淨係喺桌面 Chrome/Edge、Android Chrome 有;iOS Safari/PWA 一律唔支援。

const SERVICE = 0xff00
const CHAR_WRITE = 0xff01
const CHAR_NOTIFY = 0xff02
const NAME_PREFIX = 'SKD-CLOCK'

// 解像度類型 → 像素(闊×高);對照 RES_TABLE
const RES: Record<number, [number, number]> = {
  0: [212, 104], // L
  1: [250, 122], // H
  2: [296, 128], // LP
  3: [400, 300], // E
  4: [212, 104], // GR
  5: [212, 104], // GRP
  6: [212, 104], // ESP
}

// 三色 dither 調色板:白 / 黑 / 紅
const PALETTE = [
  { r: 255, g: 255, b: 255 },
  { r: 0, g: 0, b: 0 },
  { r: 255, g: 0, b: 0 },
]

export interface ClockStatus {
  resType: number
  width: number
  height: number
  tri: boolean
  imgIdx: number
  batteryMv?: number
  tempC?: number
  fw?: number
}

// Web Bluetooth 型別來自 @types/web-bluetooth;唔支援嘅瀏覽器 navigator.bluetooth 係 undefined
export const bluetoothSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth

interface BluetoothDeviceLike {
  gatt?: { connect: () => Promise<GattServer>; connected: boolean; disconnect: () => void }
  addEventListener: (t: string, cb: () => void) => void
}
interface GattServer {
  getPrimaryService: (u: number) => Promise<GattService>
}
interface GattService {
  getCharacteristic: (u: number) => Promise<GattChar>
}
interface GattChar {
  writeValue: (b: BufferSource) => Promise<void>
  startNotifications: () => Promise<GattChar>
  addEventListener: (t: string, cb: (e: Event) => void) => void
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class SkdClock {
  device: BluetoothDeviceLike | null = null
  private cmd: GattChar | null = null
  status: ClockStatus | null = null
  onStatus?: (s: ClockStatus) => void
  onDisconnect?: () => void

  get connected() {
    return !!this.device?.gatt?.connected
  }

  async connect() {
    const dev: BluetoothDeviceLike = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: NAME_PREFIX }],
      optionalServices: [SERVICE],
    })
    this.device = dev
    dev.addEventListener('gattserverdisconnected', () => {
      this.cmd = null
      this.onDisconnect?.()
    })
    const gatt = await dev.gatt!.connect()
    const svc = await gatt.getPrimaryService(SERVICE)
    this.cmd = await svc.getCharacteristic(CHAR_WRITE)
    const notify = await svc.getCharacteristic(CHAR_NOTIFY)
    notify.addEventListener('characteristicvaluechanged', (e: Event) => {
      const dv = (e.target as BluetoothRemoteGATTCharacteristic).value
      if (dv) this.parseStatus(dv)
    })
    await notify.startNotifications()
    // 等固件出第一個狀態封包(最多 ~2s)
    for (let i = 0; i < 20 && !this.status; i++) await sleep(100)
  }

  private parseStatus(dv: DataView) {
    if (dv.byteLength < 16) return
    const b10 = dv.getUint8(10)
    const resType = b10 & 0x0f
    const tri = b10 >> 4 !== 0
    const [w, h] = RES[resType] ?? RES[2]
    this.status = {
      resType,
      width: w,
      height: h,
      tri,
      imgIdx: dv.getUint8(2),
      batteryMv: dv.getUint16(12, true),
      tempC: dv.getUint8(14),
      fw: dv.getUint8(11) / 10,
    }
    this.onStatus?.(this.status)
  }

  // 寫入(write-with-response)—— 靠 BLE ACK 做流控,packet 之間唔另加延遲(對照源碼)
  private async write(bytes: number[] | Uint8Array) {
    if (!this.cmd) throw new Error('未連線')
    // Uint8Array.from 一定回 Uint8Array<ArrayBuffer>(BufferSource),唔使 cast
    await this.cmd.writeValue(Uint8Array.from(bytes))
  }

  /** 對時:[0x10] + 4 byte big-endian epoch(UTC+8) */
  async syncTime() {
    const ts = Math.floor((Date.now() + 8 * 3600_000) / 1000)
    await this.write([0x10, (ts >>> 24) & 0xff, (ts >>> 16) & 0xff, (ts >>> 8) & 0xff, ts & 0xff])
  }

  /** 顯示 image slot(0–6);0xFF = 循環 */
  async showSlot(n: number) {
    await this.write([0x27, n & 0xff])
  }

  async disconnect() {
    try {
      this.device?.gatt?.disconnect()
    } catch {
      /* ignore */
    }
    this.cmd = null
    this.device = null
  }

  /** 上傳 canvas 做圖片,顯示喺屏。內部:stretch → Atkinson dither → 1-bit 打包 → 分塊上傳 → 顯示。 */
  async pushCanvas(src: HTMLCanvasElement) {
    const st = this.status
    if (!st) throw new Error('未讀到屏狀態')
    const { width: W, height: H, tri, resType, imgIdx } = st

    // 1. resize 去屏尺寸(拉伸,對照 processImage)
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const ctx = cv.getContext('2d')!
    ctx.drawImage(src, 0, 0, W, H)

    // 2. Atkinson dither(色板 snap)
    const colorMode = tri ? 1 : 0
    const dithered = applyAtkinson(ctx.getImageData(0, 0, W, H), colorMode)
    ctx.putImageData(dithered, 0, 0)

    // 3. 打包:黑板(mode 0)+(三色先)紅板(mode 1);解像度 <3 加 header
    const header = resType < 3
    const black = canvas2bytes(ctx, W, H, 0, header)
    const red = tri ? canvas2bytes(ctx, W, H, 1, header) : null

    // 4. 上傳
    if (tri && red) {
      await this.write([0x5e])
      await this.sendPlane(black)
      await this.write([0x5f])
      await this.sendPlane(red)
      await this.write([0x62])
    } else {
      await this.sendPlane(black)
      await this.write([0x62, imgIdx & 0xff])
    }

    // 5. 顯示該槽位
    await sleep(100)
    await this.showSlot(imgIdx)
  }

  // 每 256 bytes 一組:0x60+前128、0x61+後128;129-byte 封包,0xFF 預填
  private async sendPlane(bytes: Uint8Array) {
    for (let pos = 0; pos < bytes.length; pos += 256) {
      const p1 = new Uint8Array(0x81).fill(0xff)
      p1[0] = 0x60
      p1.set(bytes.subarray(pos, pos + 0x80), 1)
      await this.write(p1)
      const p2 = new Uint8Array(0x81).fill(0xff)
      p2[0] = 0x61
      p2.set(bytes.subarray(pos + 0x80, pos + 0x100), 1)
      await this.write(p2)
    }
  }
}

/**
 * 1-bit 打包(對照 canvas2bytes)。
 * mode 0 黑板:綠通道 >0 → bit 0(白);=0 → bit 1(黑或紅都算墨)。
 * mode 1 紅板:純紅(R>0,G=0,B=0)→ bit 0;其餘 → bit 1(相反極性)。
 * MSB-first;每行補到 8 的倍數(補位讀落一行,對照源碼行為)。
 */
function canvas2bytes(ctx: CanvasRenderingContext2D, width: number, height: number, mode: number, header: boolean): Uint8Array {
  const d = ctx.getImageData(0, 0, width, height).data as unknown as (number | undefined)[]
  const bytes: number[] = []
  let bits: number[] = []
  const paddedW = Math.floor((width + 7) / 8) * 8
  if (header) bytes.push(0, width, height, 0, 0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < paddedW; x++) {
      const idx = y * width * 4 + x * 4
      if (mode === 0) bits.push((d[idx + 1] ?? 0) > 0 ? 0 : 1)
      else bits.push((d[idx] ?? 0) > 0 && d[idx + 1] === 0 && d[idx + 2] === 0 ? 0 : 1)
      if (bits.length === 8) {
        bytes.push(parseInt(bits.join(''), 2))
        bits = []
      }
    }
  }
  return Uint8Array.from(bytes)
}

/** Atkinson dither → ImageData(像素 snap 去白/黑/紅);nColors 2=黑白、3=三色 */
function applyAtkinson(imageData: ImageData, colorMode: number): ImageData {
  const { width, height, data } = imageData
  const idxOut = new Uint8Array(width * height)
  const rf = new Float32Array(width * height)
  const gf = new Float32Array(width * height)
  const bf = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    rf[p] = data[i]
    gf[p] = data[i + 1]
    bf[p] = data[i + 2]
  }
  const nColors = colorMode === 0 ? 2 : 3
  const closest = (r: number, g: number, b: number) => {
    let best = Infinity
    let bi = 0
    for (let k = 0; k < nColors; k++) {
      const dr = r - PALETTE[k].r
      const dg = g - PALETTE[k].g
      const db = b - PALETTE[k].b
      const dd = dr * dr + dg * dg + db * db
      if (dd < best) {
        best = dd
        bi = k
      }
    }
    return bi
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const k = closest(rf[p], gf[p], bf[p])
      idxOut[p] = k
      const er = rf[p] - PALETTE[k].r
      const eg = gf[p] - PALETTE[k].g
      const eb = bf[p] - PALETTE[k].b
      const spread = (q: number) => {
        rf[q] += er / 8
        gf[q] += eg / 8
        bf[q] += eb / 8
      }
      if (x + 1 < width) spread(p + 1)
      if (x + 2 < width) spread(p + 2)
      if (y + 1 < height) {
        if (x - 1 >= 0) spread(p + width - 1)
        spread(p + width)
        if (x + 1 < width) spread(p + width + 1)
      }
      if (y + 2 < height) spread(p + 2 * width)
    }
  }
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const c = PALETTE[idxOut[p]]
    out[i] = c.r
    out[i + 1] = c.g
    out[i + 2] = c.b
    out[i + 3] = data[i + 3]
  }
  return new ImageData(out, width, height)
}
