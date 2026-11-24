'use client'

import PulseHeart from '@/components/PulseHeart'
import { cn } from '@/lib/utils'

/**
 * Pin something to the top of its list (a token, a contact): a star PulseHeart (React Bits,
 * components/PulseHeart.jsx). Starring fills it with ink and it beats once, throwing off a ring
 * of dots; unstarring empties it.
 */
export function Favourite({
  on,
  onChange,
  label,
  size = 28,
  className,
}: {
  on: boolean
  onChange: (v: boolean) => void
  /** "Favourite USDC": what pressing it does, for screen readers. */
  label: string
  size?: number
  className?: string
}) {
  return (
    <PulseHeart
      icon="star"
      liked={on}
      onChange={onChange}
      showCount={false}
      size={size}
      corner={8}
      likedColor="hsl(var(--foreground))"
      idleColor="hsl(var(--muted-foreground))"
      pillColor="transparent"
      textColor="hsl(var(--foreground))"
      label={label}
      className={cn('wallet-favourite', className)}
    />
  )
}
