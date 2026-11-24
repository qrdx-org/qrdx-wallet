/**
 * Drives dither.wgsl behind the wallet with the account's own activity. `glint(hash)` sends a
 * ripple over the orb from the point the hash chooses; `arrived()` sends a ring of dots out across
 * the screen when funds come in; `busy(true)` stirs the surface while a transaction waits. It also
 * answers the visitor: the studio the orb mirrors tilts toward the pointer (or a finger), and
 * scrolling turns the surface and lifts the orb a little slower than the page.
 *
 * It is a backdrop, so it is frugal: one pixel per dither cell (a quarter of the CSS pixels),
 * 30 frames a second, paused while the wallet is hidden.
 */

import { effect, frameLoop, surface } from 'vgpu'
import type { Effect, Frame, FrameLoopHandle, Gpu, Surface } from 'vgpu'
import ditherShader from './dither.wgsl'
import { CELL, INK, START, orbFor, rippleOrigin, spin } from './dither-field'
import { onThemeChange, sharedGpu, tokenRgb } from '@/lib/gpu'

const SLOTS = 6

export interface DitherOptions {
  canvas: HTMLCanvasElement
  /** Called once the first frame is on the canvas (or never, when WebGPU is unavailable). */
  onReady: () => void
  onFail: () => void
}

export function startDither({ canvas, onReady, onFail }: DitherOptions) {
  let disposed = false
  let gpu: Gpu | null = null
  let out: Surface | null = null
  let fx: Effect | null = null
  let loop: FrameLoopHandle | null = null
  let ready = false

  const t0 = performance.now()
  const time = () => START + (performance.now() - t0) / 1000
  // Each transaction's ripple: its origin on the surface and its age (99: none yet).
  const ripples: [number, number, number, number][] = Array.from({ length: SLOTS }, () => [0, 0, 1, 99])
  const seenAt: number[] = Array(SLOTS).fill(-99)
  let next = 0
  let waveAt = -99
  let busy = 0
  let busyTarget = 0
  // The pointer, -1 to 1 from the centre (y up), and the page's scroll in CSS px: targets and eased.
  const aim = [0, 0]
  const look = [0, 0]
  let scrolled = 0
  const onPointer = (e: PointerEvent) => {
    aim[0] = (e.clientX / innerWidth) * 2 - 1
    aim[1] = 1 - (e.clientY / innerHeight) * 2
  }
  // A finger lifts and the studio settles back; a mouse stays where it is.
  const onRelease = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') aim[0] = aim[1] = 0
  }
  const onLeave = () => (aim[0] = aim[1] = 0)
  /** The surface's turn: the clock's, and the scroll's. */
  const turn = (t: number) => 0.05 * t + scrolled * 0.0012

  function colors() {
    if (!fx) return
    const dark = document.documentElement.classList.contains('dark')
    fx.set({ params: { bg: tokenRgb('--background'), fg: tokenRgb('--foreground'), ink: dark ? INK.dark : INK.light, dark: dark ? 1 : 0 } })
  }

  function tick(currentFrame: Frame) {
    if (!fx || !out) return
    const t = time()
    busy += (busyTarget - busy) * 0.03
    look[0] += (aim[0] - look[0]) * 0.06
    look[1] += (aim[1] - look[1]) * 0.06
    scrolled += (scrollY - scrolled) * 0.12
    for (let i = 0; i < SLOTS; i++) ripples[i][3] = t - seenAt[i]
    const [ox, oy, r] = orbFor(...out.size)
    // The orb rises with the page at a third of its speed: it sits further back.
    const orb = [ox, oy - (scrolled * 0.35) / CELL, r]
    fx.set({ params: { resolution: out.size, orb, time: t, busy, waveAge: t - waveAt, look: [look[0], look[1], turn(t) - 0.05 * t, 0], ripples } })
    currentFrame.pass(out, fx)
    if (!ready) {
      ready = true
      onReady()
    }
  }

  function play() {
    if (!gpu || loop || disposed) return
    loop = frameLoop(gpu, tick, { fps: 30 })
  }

  function pause() {
    loop?.stop()
    loop = null
  }

  const onVisibility = () => (document.hidden ? pause() : play())
  let stopTheme = () => {}

  void (async () => {
    try {
      gpu = await sharedGpu()
      if (disposed) return
      if (!gpu) return onFail()
      void gpu.lost.then(() => {
        if (disposed) return
        pause()
        onFail()
      })
      out = surface(gpu, canvas, { dpr: 1 / CELL, alphaMode: 'opaque', label: 'dither' })
      fx = effect(gpu, ditherShader, {
        label: 'dither',
        set: {
          params: {
            resolution: out.size,
            time: START,
            busy: 0,
            orb: orbFor(...out.size),
            waveAge: 99,
            bg: [0, 0, 0],
            ink: INK.dark,
            fg: [1, 1, 1],
            dark: 1,
            look: [0, 0, 0, 0],
            ripples,
          },
        },
      })
      await fx.compile(out)
      if (disposed) return
      colors()
      stopTheme = onThemeChange(colors)
      document.addEventListener('visibilitychange', onVisibility)
      addEventListener('pointermove', onPointer, { passive: true })
      addEventListener('pointerdown', onPointer, { passive: true })
      addEventListener('pointerup', onRelease, { passive: true })
      addEventListener('pointercancel', onRelease, { passive: true })
      document.documentElement.addEventListener('pointerleave', onLeave)
      if (!document.hidden) play()
    } catch (e) {
      console.warn('QRDX graphics: the backdrop is showing its still frame.', e)
      if (!disposed) onFail()
    }
  })()

  return {
    /** A new transaction on the account: a ripple runs over the orb from the point its hash chooses. */
    glint(hash: string) {
      if (!fx) return
      const t = time()
      const i = next++ % SLOTS
      // Into the surface's frame, which has turned with the clock and the scroll (dither.wgsl).
      ripples[i] = [...spin(rippleOrigin(hash), turn(t)), 0]
      seenAt[i] = t
    },
    /** Funds arrived: the orb brightens and a ring of dots runs out across the screen. */
    arrived() {
      if (fx) waveAt = time()
    },
    /** Whether one of the account's transactions is waiting to confirm. */
    busy(pending: boolean) {
      busyTarget = pending ? 1 : 0
    },
    dispose() {
      disposed = true
      pause()
      stopTheme()
      document.removeEventListener('visibilitychange', onVisibility)
      removeEventListener('pointermove', onPointer)
      removeEventListener('pointerdown', onPointer)
      removeEventListener('pointerup', onRelease)
      removeEventListener('pointercancel', onRelease)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      // After a lost device these can throw; there is nothing left to free then.
      for (const free of [() => fx?.dispose(), () => out?.dispose()]) {
        try {
          free()
        } catch {}
      }
    },
  }
}
