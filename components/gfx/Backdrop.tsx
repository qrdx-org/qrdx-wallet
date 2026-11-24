'use client'

import { useEffect, useRef, useState } from 'react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { cn } from '@/lib/utils'
import { onThemeChange, prefersReducedMotion, tokenRgb } from '@/lib/gpu'
import { drawStill } from './dither-field'
import type { startDither } from './dither-scene'

/**
 * The dithered orb (dither.wgsl) behind every wallet screen. Its still frame is drawn first, on
 * the CPU, and stays where there is no WebGPU or under reduced motion; the live canvas fades in
 * over it once it has drawn. Screens are glass over it, so they must not paint an opaque
 * background of their own.
 *
 * It moves with the account's own activity: a transaction that appears while the wallet is open
 * ripples the surface, one waiting to confirm stirs it, and funds coming in send a ring out.
 */
export function Backdrop() {
  const stillRef = useRef<HTMLCanvasElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scene = useRef<ReturnType<typeof startDither> | null>(null)
  const [live, setLive] = useState(false)
  const { transactions, activeChain, activeAddress } = useWallet()
  const pending = transactions.some((t) => t.status === 'pending')
  const pendingRef = useRef(pending)

  // The still: drawn now, again when the theme flips or the window settles at a new size.
  useEffect(() => {
    const still = stillRef.current
    if (!still) return
    const draw = () => drawStill(still, tokenRgb('--background'), tokenRgb('--foreground'), document.documentElement.classList.contains('dark'))
    draw()
    let timer: ReturnType<typeof setTimeout> | undefined
    const onResize = () => {
      clearTimeout(timer)
      timer = setTimeout(draw, 150)
    }
    window.addEventListener('resize', onResize)
    const stopTheme = onThemeChange(draw)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
      stopTheme()
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || prefersReducedMotion()) return
    let on = true
    let s: ReturnType<typeof startDither> | null = null
    import('./dither-scene').then(
      ({ startDither }) => {
        if (!on) return
        s = startDither({ canvas, onReady: () => on && setLive(true), onFail: () => on && setLive(false) })
        scene.current = s
        s.busy(pendingRef.current)
      },
      (e) => console.warn('QRDX graphics: could not load the backdrop.', e)
    )
    return () => {
      on = false
      s?.dispose()
      scene.current = null
    }
  }, [])

  useEffect(() => {
    pendingRef.current = pending
    scene.current?.busy(pending)
  }, [pending])

  // The first list for an account is history, not news: only hashes that appear after it count.
  const seen = useRef<{ key: string; hashes: Set<string> } | null>(null)
  const account = `${activeChain.id}:${activeAddress ?? ''}`
  useEffect(() => {
    if (!transactions.length) return
    if (seen.current?.key !== account) {
      seen.current = { key: account, hashes: new Set(transactions.map((t) => t.hash)) }
      return
    }
    const known = seen.current.hashes
    const fresh = transactions.filter((t) => !known.has(t.hash))
    for (const t of fresh) known.add(t.hash)
    for (const t of fresh.slice(0, 3)) scene.current?.glint(t.hash)
    if (fresh.some((t) => t.type === 'receive' && t.status === 'confirmed')) scene.current?.arrived()
  }, [transactions, account])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <canvas ref={stillRef} className="absolute inset-0 h-full w-full [image-rendering:pixelated]" />
      <canvas
        ref={canvasRef}
        className={cn('absolute inset-0 h-full w-full transition-opacity duration-700 ease-out [image-rendering:pixelated]', live ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  )
}
