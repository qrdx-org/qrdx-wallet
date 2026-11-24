/**
 * A price line in the backdrop's language: the area under it printed in the same 2-px ordered
 * dither (dense just under the line, thinning toward the floor), the line itself crisp over it, and
 * a dotted mark at the range's opening price, so above or below the start reads at a glance.
 *
 * It moves only when something happens: the line draws in from the left the first time, morphs
 * to the new shape when the data changes (a new range, a new price), and follows the pointer when
 * scrubbed, dimming what lies after the scrubbed moment. Between those it draws nothing, so an
 * idle chart costs nothing. Under reduced motion every change is immediate.
 */

import { bayer } from './dither-field'
import { onThemeChange, prefersReducedMotion, tokenRgb } from '@/lib/gpu'

/** CSS pixels per dot, as on the backdrop. */
const CELL = 2
/** Where the line may go, as fractions of the height from the bottom. */
const LOW = 0.1
const HIGH = 0.82
const MORPH_MS = 750
const REVEAL_MS = 1100
/** Room after the newest point, in CSS px, so its dot is never cut by the card's edge. */
const TAIL = 14

const easeOut = (t: number) => 1 - (1 - t) ** 4
const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

export interface ChartFrame {
  /** The newest point, in CSS px from the chart's top left (null while the line draws in). */
  end: [number, number] | null
  /** The scrubbed moment: its index in the data, where it sits, and how visible it is (0 to 1). */
  scrub: { index: number; x: number; y: number; alpha: number } | null
}

export function ditherChart(canvas: HTMLCanvasElement, { height, onFrame }: { height: number; onFrame: (f: ChartFrame) => void }) {
  const reduce = prefersReducedMotion()
  const ctx = canvas.getContext('2d')
  const cells = document.createElement('canvas')
  const cctx = cells.getContext('2d')
  let width = 0
  let cols = 0
  // The columns the line spans: all but the tail.
  let span = 0
  let rows = Math.ceil(height / CELL)
  let img: ImageData | null = null

  let values: number[] = []
  // Each column's line height (0: the floor, 1: the top): as shown, and the morph's ends.
  let shown: Float32Array = new Float32Array(0)
  let from = shown
  let to = shown
  let open = { shown: 0.5, from: 0.5, to: 0.5 }
  let morphAt = -1
  let revealAt = -1
  let drawn = false

  let scrubTo: number | null = null
  let scrubX = 0
  let scrubAlpha = 0

  let fg: [number, number, number] = [1, 1, 1]
  let bg: [number, number, number] = [0, 0, 0]
  let dark = true
  let raf = 0

  /** The data resampled to one height per column, and the opening price's height. */
  function heights(): { line: Float32Array; open: number } {
    const line = new Float32Array(span)
    const n = values.length
    if (!n || !span) return { line, open: 0.5 }
    let lo = Infinity
    let hi = -Infinity
    for (const v of values) {
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
    const norm = (v: number) => (hi > lo ? LOW + ((v - lo) / (hi - lo)) * (HIGH - LOW) : (LOW + HIGH) / 2)
    for (let c = 0; c < span; c++) {
      const at = span > 1 ? (c / (span - 1)) * (n - 1) : 0
      const i = Math.floor(at)
      const f = at - i
      line[c] = norm(values[i] + ((values[Math.min(i + 1, n - 1)] ?? values[i]) - values[i]) * f)
    }
    return { line, open: norm(values[0]) }
  }

  const xOf = (c: number) => c * CELL + CELL / 2
  /** The line's height at a CSS x, between columns. */
  function lineAt(x: number): number {
    const c = Math.min(Math.max((x - CELL / 2) / CELL, 0), span - 1)
    const i = Math.floor(c)
    return shown[i] + ((shown[Math.min(i + 1, span - 1)] ?? shown[i]) - shown[i]) * (c - i)
  }

  function colors() {
    fg = tokenRgb('--foreground')
    bg = tokenRgb('--background')
    dark = document.documentElement.classList.contains('dark')
    kick()
  }

  function frame(now: number) {
    raf = 0
    let moving = false
    if (morphAt >= 0) {
      const p = clamp01((now - morphAt) / MORPH_MS)
      const e = easeOut(p)
      for (let c = 0; c < span; c++) shown[c] = from[c] + (to[c] - from[c]) * e
      open.shown = open.from + (open.to - open.from) * e
      if (p < 1) moving = true
      else morphAt = -1
    }
    let reveal = 1
    if (revealAt >= 0) {
      reveal = easeOut(clamp01((now - revealAt) / REVEAL_MS))
      if (reveal < 1) moving = true
      else revealAt = -1
    }
    const alphaTo = scrubTo == null ? 0 : 1
    scrubAlpha += (alphaTo - scrubAlpha) * (reduce ? 1 : 0.22)
    if (Math.abs(alphaTo - scrubAlpha) < 0.01) scrubAlpha = alphaTo
    else moving = true
    if (scrubTo != null) {
      // From nothing it appears where the pointer is; after that it glides.
      if (scrubAlpha < 0.08 || reduce) scrubX = scrubTo
      else scrubX += (scrubTo - scrubX) * 0.32
      if (Math.abs(scrubTo - scrubX) < 0.3) scrubX = scrubTo
      else moving = true
    }
    draw(reveal)
    if (moving) kick()
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(frame)
  }

  function draw(reveal: number) {
    if (!ctx || !cctx || !span || !values.length) return
    if (!img || img.width !== cols || img.height !== rows) img = cctx.createImageData(cols, rows)
    const px = img.data
    px.fill(0)
    const [r, g, b] = fg.map((v) => Math.round(v * 255))
    const ink = Math.round(255 * (dark ? 0.55 : 0.5))
    const head = reveal * span
    const scrubCol = (scrubX - CELL / 2) / CELL
    const edge = Math.max(4, cols * 0.06)
    const put = (c: number, y: number, a: number) => {
      const i = (y * cols + c) * 4
      px[i] = r
      px[i + 1] = g
      px[i + 2] = b
      px[i + 3] = Math.max(px[i + 3], a)
    }

    // The fill: a glow just under the line over a long falloff, fading at the sides and floor.
    for (let c = 0; c < span && c < head; c++) {
      const line = (1 - shown[c]) * rows
      let k = Math.min(1, c / edge, (span + 2 - c) / 4, (head - c) / 6)
      if (c > scrubCol) k *= 1 - 0.72 * scrubAlpha
      if (k <= 0) continue
      for (let y = Math.max(0, Math.ceil(line)); y < rows; y++) {
        const d = y + 0.5 - line
        const floor = 1 - y / rows
        const tone = (0.48 * Math.exp(-d / (rows * 0.3)) + 0.5 * Math.exp(-((d / 1.7) ** 2))) * k * Math.sqrt(floor)
        if (tone > bayer(c, y)) put(c, y, ink)
      }
    }
    // The opening price: every third dot across (to the far edge once drawn in).
    const oy = Math.round((1 - open.shown) * rows)
    const across = reveal < 1 ? head : cols
    if (oy >= 0 && oy < rows) for (let c = 0; c < across; c += 3) put(c, oy, Math.round(ink * 0.7))
    // The scrubbed moment: a dotted rule down the chart.
    if (scrubAlpha > 0.02) {
      const sc = Math.round(scrubCol)
      if (sc >= 0 && sc < cols) for (let y = 0; y < rows; y += 2) put(sc, y, Math.round(200 * scrubAlpha))
    }
    cctx.putImageData(img, 0, 0)

    const dpr = canvas.width / Math.max(width, 1)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(cells, 0, 0, cols * CELL, rows * CELL)

    // The line, crisp, with a little light of its own on black.
    const ink3 = `${r}, ${g}, ${b}`
    const path = new Path2D()
    for (let c = 0; c < span; c++) {
      const y = (1 - shown[c]) * height
      if (c) path.lineTo(xOf(c), y)
      else path.moveTo(xOf(c), y)
    }
    const stroke = (x0: number, x1: number, alpha: number) => {
      if (x1 <= x0) return
      ctx.save()
      ctx.beginPath()
      ctx.rect(x0, 0, x1 - x0, height)
      ctx.clip()
      ctx.lineWidth = 1.75
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.strokeStyle = `rgba(${ink3}, ${alpha})`
      if (dark) {
        ctx.shadowColor = `rgba(${ink3}, ${0.45 * alpha})`
        ctx.shadowBlur = 8
      }
      ctx.stroke(path)
      ctx.restore()
    }
    const headX = head * CELL
    const cut = scrubAlpha > 0.01 ? Math.min(scrubX, headX) : headX
    stroke(0, cut, 1)
    stroke(cut, headX, 1 - 0.62 * scrubAlpha)

    const dot = (x: number, y: number, rad: number, alpha: number) => {
      ctx.beginPath()
      ctx.arc(x, y, rad, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${bg.map((v) => Math.round(v * 255)).join(', ')}, ${alpha})`
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = `rgba(${ink3}, ${alpha})`
      ctx.stroke()
    }
    if (reveal < 1) dot(headX, (1 - lineAt(headX)) * height, 2.5, 1)
    const n = values.length
    const sy = (1 - lineAt(scrubX)) * height
    if (scrubAlpha > 0.01) dot(scrubX, sy, 4, scrubAlpha)

    onFrame({
      end: reveal < 1 ? null : [xOf(span - 1), (1 - shown[span - 1]) * height],
      scrub:
        scrubAlpha > 0.01
          ? { index: Math.round(clamp01((scrubX - CELL / 2) / Math.max((span - 1) * CELL, 1)) * (n - 1)), x: scrubX, y: sy, alpha: scrubAlpha }
          : null,
    })
    drawn = true
  }

  const stopTheme = onThemeChange(colors)
  colors()

  return {
    /** The chart's CSS width: the canvas follows it and the line snaps to the new columns. */
    resize(w: number) {
      if (w <= 0 || w === width) return
      width = w
      cols = Math.ceil(w / CELL)
      span = Math.max(2, cols - Math.round(TAIL / CELL))
      rows = Math.ceil(height / CELL)
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(height * dpr)
      cells.width = cols
      cells.height = rows
      const h = heights()
      shown = h.line
      to = shown
      morphAt = -1
      open = { shown: h.open, from: h.open, to: h.open }
      kick()
    },
    /** New data: the first draws in from the left, later ones morph from what is shown. */
    setData(next: number[]) {
      values = next
      const h = heights()
      if (!drawn || reduce || shown.length !== span) {
        shown = h.line
        open = { shown: h.open, from: h.open, to: h.open }
        if (!drawn && !reduce && revealAt < 0) revealAt = performance.now()
      } else {
        from = shown.slice()
        to = h.line
        open = { shown: open.shown, from: open.shown, to: h.open }
        morphAt = performance.now()
      }
      kick()
    },
    /** The pointer's CSS x over the chart, or null when it leaves. */
    scrub(x: number | null) {
      scrubTo = x == null ? null : Math.min(Math.max(x, CELL / 2), xOf(span - 1))
      kick()
    },
    dispose() {
      cancelAnimationFrame(raf)
      raf = 0
      stopTheme()
    },
  }
}
