import { cn } from '@/lib/utils'

/**
 * The QRDX mark in currentColor: a rounded square broken at its lower-right
 * corner by the diagonal tail (the same drawing as the trade site's logo).
 */
export function QrdxMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-8 w-8', className)} aria-hidden>
      <defs>
        {/* Every instance defines the same mask, so one fixed id is safe. */}
        <mask id="qrdx-mark-cut">
          <rect width="64" height="64" fill="white" />
          <polygon points="22,25 40,25 66,57 48,57" fill="black" />
        </mask>
      </defs>
      <rect x="7.5" y="9.5" width="41" height="38" rx="8" fill="none" stroke="currentColor" strokeWidth="7.5" mask="url(#qrdx-mark-cut)" />
      <polygon points="26,27 36,27 59,55 49,55" fill="currentColor" />
    </svg>
  )
}

/** The mark and name, as the trade site writes its own: no tile, "Wallet" in grey. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <QrdxMark className="h-[22px] w-[22px] text-foreground" />
      <span className="text-[15px] font-semibold tracking-tight">
        QRDX<span className="ml-1 font-normal text-muted-foreground">Wallet</span>
      </span>
    </span>
  )
}

/**
 * The mark as an image (white), framed square on its optical centre, as the app icon is
 * (scripts/icon/app-icon.svg): for components that take an image, like the liquid glass logo.
 */
export const QRDX_MARK_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1.5 -2.5 64.4 64.4"><defs><mask id="c"><rect x="-10" y="-10" width="90" height="90" fill="white"/><polygon points="22,25 40,25 66,57 48,57" fill="black"/></mask></defs><rect x="7.5" y="9.5" width="41" height="38" rx="8" fill="none" stroke="#fff" stroke-width="7.5" mask="url(#c)"/><polygon points="26,27 36,27 59,55 49,55" fill="#fff"/></svg>'
)}`
