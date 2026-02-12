'use client'

import { useState, useEffect } from 'react'
import {
  Shield,
  Download,
  Smartphone,
  Chrome,
  Globe,
  ChevronRight,
  Zap,
  Lock,
  Layers,
  ArrowRight,
  Monitor,
  Share,
  PlusSquare,
  MoreVertical,
  Menu,
} from 'lucide-react'

// ── Detect platform ──────────────────────────────────────────────────────
function usePlatform() {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop')
  const [browser, setBrowser] = useState<'chrome' | 'firefox' | 'safari' | 'edge' | 'other'>('other')

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase()
    if (/iphone|ipad|ipod/.test(ua)) setPlatform('ios')
    else if (/android/.test(ua)) setPlatform('android')
    else setPlatform('desktop')

    if (/edg/.test(ua)) setBrowser('edge')
    else if (/chrome/.test(ua)) setBrowser('chrome')
    else if (/firefox/.test(ua)) setBrowser('firefox')
    else if (/safari/.test(ua)) setBrowser('safari')
    else setBrowser('other')
  }, [])

  return { platform, browser }
}

// ── PWA install instructions per platform ─────────────────────────────
function PWAInstructions({ platform, browser }: { platform: string; browser: string }) {
  if (platform === 'ios') {
    return (
      <div className="space-y-4">
        <h4 className="font-semibold text-foreground">Install on iOS (Safari)</h4>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
            <span>Tap the <Share className="inline h-4 w-4 -mt-0.5" /> <strong>Share</strong> button at the bottom of Safari</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
            <span>Scroll down and tap <PlusSquare className="inline h-4 w-4 -mt-0.5" /> <strong>Add to Home Screen</strong></span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
            <span>Tap <strong>Add</strong> in the top-right corner — done!</span>
          </li>
        </ol>
      </div>
    )
  }

  if (platform === 'android') {
    return (
      <div className="space-y-4">
        <h4 className="font-semibold text-foreground">Install on Android (Chrome)</h4>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
            <span>Tap the <MoreVertical className="inline h-4 w-4 -mt-0.5" /> <strong>menu</strong> (three dots) in Chrome</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
            <span>Tap <strong>Add to Home screen</strong> or <strong>Install app</strong></span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
            <span>Confirm by tapping <strong>Install</strong> — you're all set!</span>
          </li>
        </ol>
      </div>
    )
  }

  // Desktop
  return (
    <div className="space-y-4">
      <h4 className="font-semibold text-foreground">Install on Desktop</h4>
      <ol className="space-y-3 text-sm text-muted-foreground">
        <li className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
          <span>
            {browser === 'chrome' || browser === 'edge'
              ? <>Click the <Download className="inline h-4 w-4 -mt-0.5" /> <strong>Install</strong> icon in the address bar</>
              : <>Open this page in <strong>Chrome</strong> or <strong>Edge</strong>, then click the install icon in the address bar</>
            }
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
          <span>Click <strong>Install</strong> in the confirmation dialog</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
          <span>The wallet opens in its own window — pin it to your taskbar for quick access!</span>
        </li>
      </ol>
    </div>
  )
}

// ── Feature cards ─────────────────────────────────────────────────────
const features = [
  {
    icon: Shield,
    title: 'Post-Quantum Security',
    description: 'CRYSTALS-Dilithium & Kyber algorithms protect your assets against future quantum attacks.',
  },
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Instant transactions with sub-second finality on the QRDX network.',
  },
  {
    icon: Lock,
    title: 'Self-Custodial',
    description: 'Your keys, your crypto. AES-256 encrypted vault stored on your device.',
  },
  {
    icon: Layers,
    title: 'Multi-Platform',
    description: 'Browser extension, PWA, and mobile — one wallet everywhere.',
  },
]

// ── Main landing page component ───────────────────────────────────────
export function LandingPage() {
  const { platform, browser } = usePlatform()
  const [showPWA, setShowPWA] = useState(false)

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Nav ─────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-border/50 glass">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/60" />
            <span className="text-lg font-bold tracking-tight">QRDX Wallet</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/wallet"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              Open Wallet <ArrowRight className="h-3.5 w-3.5" />
            </a>
            <a
              href="/wallet"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Launch App
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="pointer-events-none absolute inset-0 -top-40">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-primary/10 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
              <Shield className="h-3.5 w-3.5" />
              Quantum-Resistant Cryptography
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              The wallet built for the{' '}
              <span className="gradient-text">post-quantum</span> era
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Secure your digital assets with CRYSTALS-Dilithium signatures and lattice-based
              encryption — available as a browser extension, progressive web app, or mobile app.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <a
                href="#download"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all hover:shadow-xl hover:shadow-primary/30"
              >
                <Download className="h-5 w-5" /> Download
              </a>
              <a
                href="/wallet"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-base font-semibold hover:bg-secondary transition-colors"
              >
                <Globe className="h-5 w-5" /> Open Web Wallet
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────── */}
      <section className="border-t border-border/50 bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Security without compromise
            </h2>
            <p className="mt-4 text-muted-foreground">
              Built from the ground up to withstand the quantum computing threat.
            </p>
          </div>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border/60 bg-card p-6 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Download / Install ──────────────────────────────────── */}
      <section id="download" className="border-t border-border/50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Get QRDX Wallet
            </h2>
            <p className="mt-4 text-muted-foreground">
              Choose the version that works best for you.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Browser Extension */}
            <div className="group relative rounded-2xl border border-border/60 bg-card p-6 transition-all hover:border-primary/40 hover:shadow-lg">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Chrome className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold">Browser Extension</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Chrome, Brave, Edge & Firefox. Integrates with dApps for seamless Web3 interactions.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <a
                  href="#"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Chrome Web Store <ChevronRight className="h-4 w-4" />
                </a>
                <a
                  href="#"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
                >
                  Firefox Add-ons <ChevronRight className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* PWA */}
            <div className="group relative rounded-2xl border border-primary/40 bg-card p-6 shadow-lg shadow-primary/5 transition-all hover:shadow-xl">
              <div className="absolute -top-3 right-4 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                Recommended
              </div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Globe className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold">Progressive Web App</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Install directly from your browser — no app store required. Works offline, feels native.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <a
                  href="/wallet"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Open Wallet <ArrowRight className="h-4 w-4" />
                </a>
                <button
                  onClick={() => setShowPWA(!showPWA)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
                >
                  {showPWA ? 'Hide' : 'Show'} Install Steps <ChevronRight className={`h-4 w-4 transition-transform ${showPWA ? 'rotate-90' : ''}`} />
                </button>
              </div>
              {showPWA && (
                <div className="mt-5 rounded-xl border border-border/60 bg-background/50 p-4 animate-slide-up">
                  <PWAInstructions platform={platform} browser={browser} />
                </div>
              )}
            </div>

            {/* Mobile */}
            <div className="group relative rounded-2xl border border-border/60 bg-card p-6 transition-all hover:border-primary/40 hover:shadow-lg">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Smartphone className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold">Mobile App</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Native iOS & Android experience with biometric unlock and secure enclave storage.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <span className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground cursor-default">
                  Coming Soon
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-border/50 bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-primary/60" />
              <span className="text-sm font-semibold">QRDX Foundation</span>
            </div>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} QRDX Foundation. Open-source under the ISC License.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
