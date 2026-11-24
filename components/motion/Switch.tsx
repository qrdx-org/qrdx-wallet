'use client'

import SquishSwitch from '@/components/SquishSwitch'
import { SoapBubbleToggle } from '@/components/soap-bubble'
import { useBubble } from '@/components/gfx/Bubble'

/**
 * An on/off setting. In the normal look a SquishSwitch (React Bits, components/SquishSwitch.jsx):
 * its thumb stretches as it travels and can be dragged across; ink on when on, grey when off. In
 * the liquid bubble look (components/gfx/Bubble.tsx), a soap bubble toggle.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  /** What it turns on, for screen readers (the row shows it). */
  label: string
  disabled?: boolean
}) {
  const bubble = useBubble()
  if (bubble.on)
    return <SoapBubbleToggle checked={checked} onCheckedChange={onChange} aria-label={label} disabled={disabled} scale={0.75} />
  return (
    <SquishSwitch
      checked={checked}
      onChange={onChange}
      ariaLabel={label}
      disabled={disabled}
      width={46}
      height={26}
      radius={13}
      trackColor="hsl(var(--foreground) / 0.14)"
      trackOnColor="hsl(var(--foreground))"
      thumbColor="hsl(var(--background))"
      thumbOnColor="hsl(var(--background))"
      className="shrink-0"
    />
  )
}
