'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTheme } from 'next-themes'
import ReflectiveCard from '@/components/ReflectiveCard'

/** A card's height for its width: a little taller than square, the image above its caption. */
const RATIO = 1.32

/**
 * An NFT as a card of polished metal (React Bits' ReflectiveCard): it tilts toward the pointer and
 * catches light across its face, in the wallet's greys. Never with the camera: the card's own
 * environment is what it reflects.
 *
 * Each card draws with its own WebGL context and browsers keep only a handful alive, so a card in
 * a grid is live only while it is on (or near) the screen; elsewhere it is the same content on a
 * plain tile.
 */
export function NftCard({
  image,
  title,
  subtitle,
  onOpen,
  lazy = true,
  maxWidth,
}: {
  image: ReactNode
  title: string
  subtitle: string
  onOpen?: () => void
  /** Live only near the screen (grids); false for a single large card. */
  lazy?: boolean
  maxWidth?: number
}) {
  const { resolvedTheme } = useTheme()
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [near, setNear] = useState(!lazy)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.min(e.contentRect.width, maxWidth ?? Infinity)))
    ro.observe(el)
    if (!lazy) return () => ro.disconnect()
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '160px' })
    io.observe(el)
    return () => {
      ro.disconnect()
      io.disconnect()
    }
  }, [lazy, maxWidth])

  const height = Math.round(width * RATIO)
  const content = (
    <div className="flex h-full flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-black/20">{image}</div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold leading-tight">{title}</p>
        <p className="truncate font-mono text-[10px] opacity-60">{subtitle}</p>
      </div>
    </div>
  )

  return (
    <div
      ref={box}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `${title}, ${subtitle}` : undefined}
      onClick={onOpen}
      onKeyDown={(e) => onOpen && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      className="w-full cursor-pointer rounded-[18px] outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
      style={{ maxWidth }}
    >
      {width > 0 &&
        (near ? (
          <ReflectiveCard theme={resolvedTheme === 'light' ? 'light' : 'dark'} width={width} height={height} radius={18} webcam={false} grayscale={1} tiltStrength={10}>
            {content}
          </ReflectiveCard>
        ) : (
          <div className="rounded-[18px] border border-border/60 bg-card p-3" style={{ height }}>
            {content}
          </div>
        ))}
    </div>
  )
}
