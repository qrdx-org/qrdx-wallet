'use client'

import { createContext, forwardRef, useContext, useRef, useSyncExternalStore, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, type Ref, type RefObject } from 'react'
import { useTheme } from 'next-themes'
import { SoapBubbleMaterial, SoapBubbleSurface, type SoapBubbleMaterialProps } from '@/components/soap-bubble'

/**
 * Liquid bubble: an optional look (Settings → Theme) where the wallet's main controls are soap
 * bubbles (components/soap-bubble, from ReactDrops): spectral thin film, drainage and swirls, rims
 * that mirror the dithered backdrop, pointer wobble and press squash. Light glass on the light
 * theme, rainbow glass on the dark one, as the catalog preview. Off by default; remembered here.
 */

const KEY = 'qrdx-wallet:bubble'

// The setting, kept in this browser and shared by every view of the wallet (other tabs too).
let memory = false
const listeners = new Set<() => void>()
function readOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return memory
  }
}
function writeOn(on: boolean) {
  memory = on
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* this session only */
  }
  listeners.forEach((l) => l())
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => e.key === KEY && cb()
  addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    removeEventListener('storage', onStorage)
  }
}

/** The approved material, per theme, with the configured lighting and reflections on both. */
const LIGHTING: SoapBubbleMaterialProps = {
  glass: 0.95,
  filmScale: 4.85,
  oilOpacity: 1,
  oilEdge: 18,
  thickness: 480,
  drainage: 0.35,
  swirl: 0.5,
  reflectivity: 1.3,
  refraction: 0.15,
  dispersion: 1,
  bevel: 14,
  windowLength: 1.3,
  windowMargin: 0.85,
  windowBend: 0.75,
  windowSize: 0.75,
  windowWidth: 0.8,
  windowGradient: 0.96,
  windowHead: 0.7,
  windowTail: 0.6,
  glintSize: 1.65,
  glintIntensity: 0,
  glintDistance: -0.45,
  glintHeight: 0.65,
  windowIntensity: 0.85,
  windowTwin: false,
  bottomShadeColor: '#ffffff',
}
export const BUBBLE_MATERIAL: Record<'light' | 'dark', SoapBubbleMaterialProps> = {
  light: { ...LIGHTING, iridescence: 0.5, oilCoverage: 0.73, oilEdgeFade: 2.33, clearCenter: 0.57 },
  dark: { ...LIGHTING, iridescence: 2, oilCoverage: 1, oilEdgeFade: 1, clearCenter: 0.73 },
}

interface BubbleCtx {
  on: boolean
  setOn: (on: boolean) => void
  /** The backdrop's still frame, which the bubbles refract and mirror (set by Backdrop). */
  backdrop: RefObject<HTMLCanvasElement | null>
}

const Ctx = createContext<BubbleCtx>({ on: false, setOn: () => {}, backdrop: { current: null } })

export const useBubble = () => useContext(Ctx)

export function BubbleProvider({ children }: { children: ReactNode }) {
  const on = useSyncExternalStore(subscribe, readOn, () => false)
  const setOn = writeOn
  const backdrop = useRef<HTMLCanvasElement | null>(null)
  const { resolvedTheme } = useTheme()
  const scheme = resolvedTheme === 'light' ? 'light' : 'dark'

  return (
    <Ctx.Provider value={{ on, setOn, backdrop }}>
      {/* The bubbles read the theme from the nearest data-theme. */}
      <div data-theme={scheme} className="contents">
        {/* Always rendered (it only shares the material), so switching the look keeps the tree. */}
        <SoapBubbleMaterial backdrop={backdrop} {...BUBBLE_MATERIAL[scheme]}>
          {children}
        </SoapBubbleMaterial>
      </div>
    </Ctx.Provider>
  )
}

/**
 * A panel that is a soap bubble in the liquid bubble look (calm: no wobble), and otherwise the
 * element it replaces, with its own classes.
 */
export function BubblePanel({
  as: Tag = 'div',
  className,
  bubbleClassName,
  radius = 22,
  children,
}: {
  as?: 'div' | 'section'
  /** Classes when the look is off. */
  className: string
  /** Classes when it is on (layout only: the bubble is the surface); by default, className's layout. */
  bubbleClassName?: string
  radius?: number
  children: ReactNode
}) {
  const { on } = useBubble()
  if (!on) return <Tag className={className}>{children}</Tag>
  return (
    <SoapBubbleSurface as={Tag} className={bubbleClassName ?? bubbleLayout(className)} radius={radius}>
      {children}
    </SoapBubbleSurface>
  )
}

/**
 * Classes without the surface they paint (glass, background, border, shadow): in the liquid
 * bubble look the bubble is the surface, and only layout and type are kept.
 */
export function bubbleLayout(className = ''): string {
  return className
    .split(/\s+/)
    .filter((c) => {
      const base = c.replace(/^([a-z-]+:)+/, '')
      return c && !/^(glass|glass-strong|glass-clear|metal-card)$/.test(base) && !/^(bg-|border|shadow|backdrop-|ring)/.test(base)
    })
    .join(' ')
}

/**
 * A button that is a soap bubble in the liquid bubble look (it wobbles under the pointer and
 * squashes when pressed), and otherwise a plain button with its own classes.
 */
export const BubbleButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { radius?: number; bubbleClassName?: string }>(
  function BubbleButton({ className, bubbleClassName, radius = 16, type = 'button', children, ...props }, ref) {
    const { on } = useBubble()
    if (!on)
      return (
        <button ref={ref} type={type} className={className} {...props}>
          {children}
        </button>
      )
    return (
      <SoapBubbleSurface
        ref={ref as Ref<HTMLElement>}
        as="button"
        type={type}
        interactive
        radius={radius}
        className={bubbleClassName ?? bubbleLayout(className)}
        {...(props as HTMLAttributes<HTMLElement>)}
      >
        {children}
      </SoapBubbleSurface>
    )
  }
)
