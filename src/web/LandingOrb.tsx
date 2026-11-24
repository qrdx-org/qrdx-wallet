'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { onThemeChange, prefersReducedMotion, tokenRgb } from '@/lib/gpu'
import { drawStill } from '@/components/gfx/dither-field'
import type { startDither } from '@/components/gfx/dither-scene'

/** The orb, centred in its box (cells). */
const centred = (w: number, h: number): [number, number, number] => [w / 2, h / 2, Math.min(w, h) * 0.4]

/**
 * The wallet's backdrop (components/gfx/dither.wgsl) as the landing page's picture: the same
 * liquid-chrome orb in 2-px dots, its studio turning toward the pointer. Its still frame shows
 * first and stays without WebGPU or under reduced motion.
 */
export function LandingOrb({ className }: { className?: string }) {
  const stillRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const still = stillRef.current
    if (!still) return
    const draw = () => {
      const dark = document.documentElement.classList.contains('dark')
      drawStill(still, dark ? [0, 0, 0] : [1, 1, 1], tokenRgb('--foreground'), dark, centred)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(still)
    const stop = onThemeChange(draw)
    return () => {
      ro.disconnect()
      stop()
    }
  }, [])

  useEffect(() => {
    const canvas = liveRef.current
    if (!canvas || prefersReducedMotion()) return
    let on = true
    let scene: ReturnType<typeof startDither> | null = null
    import('@/components/gfx/dither-scene').then(({ startDither }) => {
      if (!on) return
      scene = startDither({ canvas, place: centred, parallax: false, blend: true, onReady: () => on && setLive(true), onFail: () => on && setLive(false) })
    })
    return () => {
      on = false
      scene?.dispose()
    }
  }, [])

  return (
    // Blended into the page (multiply on white, screen on black), so only the dots show over its spotlight and grain.
    <div aria-hidden className={cn('relative mix-blend-multiply dark:mix-blend-screen', className)}>
      <canvas ref={stillRef} className="absolute inset-0 h-full w-full [image-rendering:pixelated]" />
      <canvas ref={liveRef} className={cn('absolute inset-0 h-full w-full transition-opacity duration-700 [image-rendering:pixelated]', live ? 'opacity-100' : 'opacity-0')} />
    </div>
  )
}
