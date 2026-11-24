/**
 * What the dithered backdrop (dither.wgsl) and its still frame share: the size of a dot, where the
 * orb sits, where a transaction's ripple starts, and the surface itself, drawn once on the CPU for
 * the still (without WebGPU, under reduced motion, and while the live one starts).
 */

/** CSS pixels per dither cell: the canvas has one pixel per cell and the browser enlarges it, crisp. */
export const CELL = 2
/** The backdrop's clock starts here, so the still frame and the first live frame are the same. */
export const START = 14
/** How strongly a dot shows over the background: dots are ink, not text, so they stay quieter. */
export const INK = { dark: 0.5, light: 0.42 }

/**
 * The orb's centre and radius, in cells, for a canvas `w` by `h` cells. On a phone (and the
 * extension popup) it sits top right, behind the header and balance, clear of the wordmark and
 * the first screens' headlines; on a wide window it sits beside the wallet's column (448 CSS px,
 * centred), a little behind it.
 */
export function orbFor(w: number, h: number): [number, number, number] {
  if (w < h * 1.05) return [w * 0.9, h * 0.1, w * 0.5]
  const half = 224 / CELL
  const r = Math.max(h * 0.2, Math.min(h * 0.36, (w / 2 - half) * 0.9))
  return [w / 2 + half + r * 0.75, h * 0.52, r]
}

/**
 * Where a transaction's ripple starts, chosen by its hash (the same hash, the same place): a point
 * on the side of the orb that faces the viewer and the light, in the view's frame.
 */
export function rippleOrigin(hash: string): [number, number, number] {
  const hex = hash.replace(/^0x/, '').padEnd(8, '0')
  const u = parseInt(hex.slice(0, 4), 16) / 0xffff
  const v = parseInt(hex.slice(4, 8), 16) / 0xffff
  const x = -0.35 + 0.5 * (u - 0.5)
  const y = 0.1 + 0.5 * (v - 0.5)
  const z = Math.sqrt(Math.max(1 - x * x - y * y, 0))
  return [x, y, z]
}

/** Turns a point about the vertical axis (dither.wgsl's `spin`). */
export function spin([x, y, z]: number[], a: number): [number, number, number] {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c * x + s * z, y, -s * x + c * z]
}

/** dither.wgsl's `bayer`: the 8x8 threshold for a cell, from 0 to 1 (the charts dither with it too). */
export function bayer(cx: number, cy: number): number {
  const x = cx ^ cy
  let v = 0
  for (let b = 0; b < 3; b++) {
    v |= ((x >> b) & 1) << (5 - 2 * b)
    v |= ((cy >> b) & 1) << (4 - 2 * b)
  }
  return (v + 0.5) / 64
}

const WAVES = [
  [0.62, 0.55, 0.56, 4.2, 0.11, 0.45, 0],
  [-0.7, 0.24, 0.67, 6.1, 0.07, -0.6, 1.7],
  [0.15, -0.88, 0.45, 7.7, 0.05, 0.75, 3.1],
  [-0.33, -0.41, -0.85, 9.6, 0.035, -0.9, 4.4],
].map(([x, y, z, f, a, k, p]) => {
  const l = Math.hypot(x, y, z)
  return { d: [x / l, y / l, z / l], f, a, k, p }
})
const LIGHT = (() => {
  const l = Math.hypot(-0.5, 0.58, 0.64)
  return [-0.5 / l, 0.58 / l, 0.64 / l]
})()
const STRIP = [0.72, -0.5, 0.48]
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** dither.wgsl's `tone` at rest: nothing pending, no ripples, no funds arriving. */
function tone(qx: number, qy: number, t: number, dark: boolean): number {
  const d = Math.hypot(qx, qy)
  const a = Math.atan2(qy, qx)
  const r = 1 + 0.022 * Math.sin(3 * a + 0.5 * t) + 0.014 * Math.sin(5 * a - 0.37 * t + 1.3) + 0.008 * Math.sin(8 * a + 0.8 * t + 0.4)
  if (d >= r) return (dark ? 1 : 0.6) * 0.09 * Math.exp(-(d - r) * 8)

  const sx = qx / r
  const sy = qy / r
  const n = [sx, sy, Math.sqrt(Math.max(1 - sx * sx - sy * sy, 0))]
  const turn = 0.05 * t
  const m = spin(n, turn)
  const warp = 0.9 * Math.sin(dot(m, [1.3, -0.7, 0.9]) * 2.3 + 0.21 * t)
  let g = [0, 0, 0]
  for (const w of WAVES) {
    const c = w.a * w.f * Math.cos(w.f * dot(m, w.d) - w.k * t + w.p + warp) * 0.8
    g = [g[0] + c * w.d[0], g[1] + c * w.d[1], g[2] + c * w.d[2]]
  }
  const gv = spin(g, -turn)
  const along = dot(gv, n)
  let nn = [n[0] - (gv[0] - along * n[0]), n[1] - (gv[1] - along * n[1]), n[2] - (gv[2] - along * n[2])]
  const len = Math.hypot(nn[0], nn[1], nn[2])
  nn = [nn[0] / len, nn[1] / len, nn[2] / len]
  const diff = Math.max(dot(nn, LIGHT), 0)
  // reflect((0, 0, -1), nn)
  const rv = [2 * nn[2] * nn[0], 2 * nn[2] * nn[1], -1 + 2 * nn[2] * nn[2]]
  const k = Math.min(Math.max((rv[1] + 0.15) / 1, 0), 1)
  const sky = k * k * (3 - 2 * k)
  const env = 0.1 + 0.56 * sky * sky + 0.3 * Math.exp(-(((rv[1] + 0.04) * 10) ** 2)) + 1.1 * Math.max(dot(rv, LIGHT), 0) ** 48 + 0.5 * Math.max(dot(rv, STRIP), 0) ** 10
  const rim = (1 - n[2]) ** 3
  const lit = 0.6 * env + 0.3 * diff * diff + 0.15 * rim
  return dark ? lit : 0.7 * Math.min(Math.max(0.95 - lit, 0), 1) + 0.25 * rim
}

type Rgb = [number, number, number]

/** Draws the still frame into a 2D canvas sized to the backdrop, one pixel per cell. */
export function drawStill(canvas: HTMLCanvasElement, bg: Rgb, fg: Rgb, dark: boolean) {
  const ink = dark ? INK.dark : INK.light
  const w = Math.max(1, Math.round(canvas.clientWidth / CELL))
  const h = Math.max(1, Math.round(canvas.clientHeight / CELL))
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const img = ctx.createImageData(w, h)
  const px = img.data
  const off = bg.map((c) => Math.round(c * 255))
  const on = bg.map((c, i) => Math.round((c + (fg[i] - c) * ink) * 255))
  const [ox, oy, r] = orbFor(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const qx = (x + 0.5 - ox) / r
      const qy = -(y + 0.5 - oy) / r
      // Past the aura nothing is lit; skip the surface there.
      const lit = qx * qx + qy * qy < 2.6 && tone(qx, qy, START, dark) > bayer(x, y)
      const c = lit ? on : off
      const i = (y * w + x) * 4
      px[i] = c[0]
      px[i + 1] = c[1]
      px[i + 2] = c[2]
      px[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
