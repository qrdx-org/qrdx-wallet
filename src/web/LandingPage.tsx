'use client'

import { useState, type ReactNode } from 'react'
import { useHydrated } from '@/lib/use-hydrated'
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  Fingerprint,
  Globe,
  KeyRound,
  Landmark,
  Lock,
  MoreVertical,
  Network,
  PlusSquare,
  Puzzle,
  QrCode,
  Share,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DOWNLOADS, REPO_URL } from './downloads'

type Browser = 'chromium' | 'firefox' | 'safari' | 'other'
type Platform = 'ios' | 'android' | 'desktop'

// ── Detect platform ──────────────────────────────────────────────────────
function usePlatform(): { platform: Platform; browser: Browser; known: boolean } {
  // Read the user agent only after hydration; the static export renders "desktop".
  const hydrated = useHydrated()
  const ua = hydrated ? navigator.userAgent.toLowerCase() : ''
  const platform: Platform = /iphone|ipad|ipod/.test(ua) ? 'ios' : /android/.test(ua) ? 'android' : 'desktop'
  // Chrome, Brave, Edge and Opera all report "chrome" and take the same build.
  const browser: Browser = /firefox|fxios/.test(ua)
    ? 'firefox'
    : /chrome|chromium|crios|edg/.test(ua)
      ? 'chromium'
      : /safari/.test(ua)
        ? 'safari'
        : 'other'
  return { platform, browser, known: hydrated }
}

// ── Small pieces ─────────────────────────────────────────────────────────
function Logo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/icon-192.png" alt="" aria-hidden className={cn('rounded-lg border border-border/60 dark:invert', className)} />
  )
}

function Steps({ children }: { children: ReactNode[] }) {
  return (
    <ol className="space-y-3 text-sm text-muted-foreground">
      {children.map((step, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-foreground">
            {i + 1}
          </span>
          <span className="min-w-0 pt-0.5 leading-relaxed">{step}</span>
        </li>
      ))}
    </ol>
  )
}

/** A browser-internal address: pages cannot link to chrome:// or about:, so it is copied instead. */
function CopyAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          },
          () => {},
        )
      }}
      className="mx-0.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-0.5 align-middle font-mono text-[12px] text-foreground transition-colors hover:bg-secondary"
      title="Copy"
    >
      <span className="truncate">{value}</span>
      {copied ? <Check className="h-3 w-3 shrink-0" /> : <Copy className="h-3 w-3 shrink-0 text-muted-foreground" />}
    </button>
  )
}

function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-xs font-medium">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            'rounded-md px-3 py-1.5 transition-colors',
            value === o.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const primaryBtn =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90'
const secondaryBtn =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold transition-colors hover:bg-secondary'

// ── Install steps ────────────────────────────────────────────────────────
function ExtensionSteps({ browser }: { browser: 'chromium' | 'firefox' }) {
  if (browser === 'firefox') {
    return (
      <Steps>
        {[
          <>
            Download <strong className="text-foreground">qrdx-wallet-firefox.zip</strong>. Keep it zipped.
          </>,
          <>
            Open <CopyAddress value="about:debugging#/runtime/this-firefox" /> in a new tab.
          </>,
          <>
            Click <strong className="text-foreground">Load Temporary Add-on…</strong> and choose the zip.
          </>,
        ]}
      </Steps>
    )
  }
  return (
    <Steps>
      {[
        <>
          Download <strong className="text-foreground">qrdx-wallet-chrome.zip</strong> and unzip it.
        </>,
        <>
          Open <CopyAddress value="chrome://extensions" /> (in Edge, <CopyAddress value="edge://extensions" />) and turn on{' '}
          <strong className="text-foreground">Developer mode</strong>.
        </>,
        <>
          Click <strong className="text-foreground">Load unpacked</strong> and choose the unzipped folder. Pin QRDX Wallet from the
          puzzle-piece menu.
        </>,
      ]}
    </Steps>
  )
}

function PhoneSteps({ platform }: { platform: 'ios' | 'android' }) {
  if (platform === 'android') {
    return (
      <Steps>
        {[
          <>Open wallet.qrdx.org/wallet in Chrome.</>,
          <>
            Tap the <MoreVertical className="-mt-0.5 inline h-4 w-4" /> menu, then <strong className="text-foreground">Install app</strong>{' '}
            or <strong className="text-foreground">Add to Home screen</strong>.
          </>,
          <>Open QRDX Wallet from your home screen.</>,
        ]}
      </Steps>
    )
  }
  return (
    <Steps>
      {[
        <>Open wallet.qrdx.org/wallet in Safari.</>,
        <>
          Tap <Share className="-mt-0.5 inline h-4 w-4" /> <strong className="text-foreground">Share</strong>, then{' '}
          <PlusSquare className="-mt-0.5 inline h-4 w-4" /> <strong className="text-foreground">Add to Home Screen</strong>.
        </>,
        <>Open it from your home screen and turn on Face ID in Settings → Security (iOS 18 or later).</>,
      ]}
    </Steps>
  )
}

// ── Content ──────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Post-quantum by default',
    body: 'Every account holds an ML-DSA-65 key. On QRDX it signs type-0x51 transactions, which a quantum computer cannot forge.',
  },
  {
    icon: KeyRound,
    title: 'One phrase, two keys',
    body: 'A classic secp256k1 key for EVM networks and a post-quantum key for QRDX, both restored from the same recovery phrase.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Trade on QRDX',
    body: "Swap, place spot orders and trade perpetuals on QRDX's native exchange, with every operation shown in plain words before you sign.",
  },
  {
    icon: Landmark,
    title: 'Stake',
    body: 'Delegate QRDX to a validator, or run one from your own account, and follow your rewards and unbonding.',
  },
  {
    icon: QrCode,
    title: 'Connect to apps',
    body: 'The extension gives sites window.ethereum, window.qrdx and EIP-6963. On the web and iPhone, connect by scanning a QR code.',
  },
  {
    icon: Lock,
    title: 'Encrypted on your device',
    body: 'Your keys never leave the device. The vault is encrypted with AES-256-GCM and unlocks with your password, or a passkey such as Face ID where the browser supports it.',
  },
]

const PLATFORM_ROWS: { label: string; values: [string, string, string] }[] = [
  { label: 'Install', values: ['Load from the zip', 'Nothing to install', 'Add to Home Screen'] },
  { label: 'dApp provider in every site', values: ['Yes', '—', '—'] },
  { label: 'Connect to sites by QR code', values: ['—', 'Yes', 'Yes'] },
  { label: 'Unlock', values: ['Password or passkey', 'Password or passkey', 'Face ID or password'] },
  { label: 'Stays unlocked across reloads', values: ['Until auto-lock', 'No', 'No'] },
]

// ── Main landing page component ───────────────────────────────────────
export function LandingPage() {
  const { platform, browser, known } = usePlatform()
  const [tab, setTab] = useState<'chromium' | 'firefox' | null>(null)
  const extTab = tab ?? (browser === 'firefox' ? 'firefox' : 'chromium')
  const [phoneTab, setPhoneTab] = useState<'ios' | 'android' | null>(null)
  const phone = phoneTab ?? (platform === 'android' ? 'android' : 'ios')
  const mobile = platform !== 'desktop'

  const heroDownload =
    known && mobile
      ? { href: '#iphone', label: platform === 'ios' ? 'Install on iPhone' : 'Install on your phone', icon: Smartphone }
      : browser === 'firefox'
        ? { href: DOWNLOADS.firefox, label: 'Download for Firefox', icon: Download }
        : { href: DOWNLOADS.chrome, label: browser === 'chromium' || !known ? 'Download for Chrome' : 'Download the extension', icon: Download }

  return (
    <div className="mono-backdrop min-h-screen text-foreground [--spotlight:0.07]">
      {/* ── Nav ─────────────────────────────────────────────────── */}
      <nav className="glass sticky top-0 z-50 !border-x-0 !border-t-0">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#" className="flex items-center gap-2.5">
            <Logo className="h-8 w-8" />
            <span className="text-base font-semibold tracking-tight">QRDX Wallet</span>
          </a>
          <div className="flex items-center gap-1 sm:gap-2">
            <a href="#features" className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground md:inline-flex">
              Features
            </a>
            <a href="#download" className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:inline-flex">
              Download
            </a>
            <a href={REPO_URL} className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground md:inline-flex">
              GitHub
            </a>
            <a href="/wallet" className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">
              Open wallet <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-[1.1fr_1fr] lg:pb-28">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3.5 py-1.5 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-foreground" />
            ML-DSA-65 post-quantum signatures
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
            The wallet for the <span className="gradient-text">post-quantum</span> era
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Self-custody for QRDX and EVM networks. Hold, send, swap, trade and stake with keys that stay on your device, as a browser
            extension, in any browser tab, or installed on your iPhone.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href={heroDownload.href} className={primaryBtn}>
              <heroDownload.icon className="h-4 w-4" /> {heroDownload.label}
            </a>
            <a href="/wallet" className={secondaryBtn}>
              <Globe className="h-4 w-4" /> Open the web wallet
            </a>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            Free and open source. Chrome, Brave, Edge and Firefox ·{' '}
            <a href="#download" className="underline underline-offset-2 hover:text-foreground">
              every way to install
            </a>
          </p>
        </div>

        {/* One phrase, two keys */}
        <div className="metal-card relative rounded-3xl border border-border bg-card/80 p-6 shadow-2xl shadow-black/10 sm:p-8">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Every account</div>
          <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">One recovery phrase</div>
                <div className="text-xs text-muted-foreground">12 or 24 words, written down once</div>
              </div>
            </div>
          </div>
          <div className="mx-auto h-6 w-px bg-border" />
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { title: 'Post-quantum key', alg: 'ML-DSA-65', addr: '0xPQ…', use: "Signs QRDX's quantum-safe transactions" },
              { title: 'Classic key', alg: 'secp256k1', addr: '0x…', use: 'For Ethereum and other EVM networks' },
            ].map((k) => (
              <div key={k.title} className="rounded-2xl border border-border bg-background/70 p-4">
                <div className="text-sm font-semibold">{k.title}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  {k.alg} · {k.addr}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{k.use}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 border-t border-border/70 pt-4 text-xs text-muted-foreground">
            <Fingerprint className="h-4 w-4 shrink-0 text-foreground" />
            Encrypted with AES-256-GCM on this device. Unlock with a password or a passkey.
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-16 border-t border-border/60 bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything QRDX, in one wallet</h2>
            <p className="mt-4 text-muted-foreground">Built for the network&apos;s native exchange, staking and post-quantum accounts, and at home on EVM chains.</p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-card p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background">
                  <f.icon className="h-[18px] w-[18px]" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Download / Install ──────────────────────────────────── */}
      <section id="download" className="scroll-mt-16 border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Get QRDX Wallet</h2>
            <p className="mt-4 text-muted-foreground">
              The same wallet three ways. Your recovery phrase moves between them, and the vault format is the same everywhere.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            {/* Browser extension */}
            <div id="extension" className="scroll-mt-20 rounded-2xl border border-border bg-card p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background">
                    <Puzzle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Browser extension</h3>
                    <p className="text-sm text-muted-foreground">Chrome, Brave, Edge and Firefox</p>
                  </div>
                </div>
                {known && browser === 'safari' && !mobile && (
                  <span className="hidden rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground sm:inline">Not for Safari</span>
                )}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Connects to any dApp through <code className="font-mono text-[12px] text-foreground">window.ethereum</code>,{' '}
                <code className="font-mono text-[12px] text-foreground">window.qrdx</code> and EIP-6963, shows every request decoded before you
                approve it, and stays unlocked until it auto-locks.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <a href={DOWNLOADS.chrome} className={cn(extTab === 'chromium' ? primaryBtn : secondaryBtn, 'justify-between')}>
                  <span className="flex items-center gap-2">
                    <Download className="h-4 w-4" /> Chrome, Brave, Edge
                  </span>
                  <span className="font-mono text-[11px] opacity-60">.zip</span>
                </a>
                <a href={DOWNLOADS.firefox} className={cn(extTab === 'firefox' ? primaryBtn : secondaryBtn, 'justify-between')}>
                  <span className="flex items-center gap-2">
                    <Download className="h-4 w-4" /> Firefox
                  </span>
                  <span className="font-mono text-[11px] opacity-60">.zip</span>
                </a>
              </div>

              <div className="mt-6 rounded-xl border border-border bg-background/60 p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-semibold">Install it</span>
                  <Tabs
                    value={extTab}
                    onChange={setTab}
                    options={[
                      { id: 'chromium', label: 'Chrome, Brave, Edge' },
                      { id: 'firefox', label: 'Firefox' },
                    ]}
                  />
                </div>
                <ExtensionSteps browser={extTab} />
                {extTab === 'firefox' && (
                  <p className="mt-4 border-t border-border/70 pt-3 text-xs leading-relaxed text-muted-foreground">
                    Until the wallet is on Firefox Add-ons, Firefox removes it when the browser restarts. Keep your recovery phrase to restore it.
                  </p>
                )}
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                Built by CI from the latest commit on main.{' '}
                <a href={DOWNLOADS.release} className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground">
                  Release notes <ExternalLink className="h-3 w-3" />
                </a>{' '}
                ·{' '}
                <a href={DOWNLOADS.checksums} className="underline underline-offset-2 hover:text-foreground">
                  SHA-256
                </a>{' '}
                ·{' '}
                <a href={DOWNLOADS.ciRuns} className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground">
                  Every build <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>

            <div className="grid gap-6">
              {/* Web */}
              <div className="rounded-2xl border border-border bg-card p-6 sm:p-7">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background">
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Web wallet</h3>
                    <p className="text-sm text-muted-foreground">Any browser, nothing to install</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Runs in this tab and locks when you reload it. Connect to sites by scanning their QR code.
                </p>
                <a href="/wallet" className={cn(secondaryBtn, 'mt-5 w-full')}>
                  Open the web wallet <ArrowRight className="h-4 w-4" />
                </a>
              </div>

              {/* iPhone / Android */}
              <div id="iphone" className="scroll-mt-20 rounded-2xl border border-border bg-card p-6 sm:p-7">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background">
                      <Smartphone className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">iPhone</h3>
                      <p className="text-sm text-muted-foreground">Full screen, unlocked with Face ID</p>
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">Install it</span>
                  <Tabs
                    value={phone}
                    onChange={setPhoneTab}
                    options={[
                      { id: 'ios', label: 'iPhone' },
                      { id: 'android', label: 'Android' },
                    ]}
                  />
                </div>
                <div className="mt-4">
                  <PhoneSteps platform={phone} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Compare ─────────────────────────────────────────────── */}
      <section className="border-t border-border/60 bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Which one?</h2>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Use the extension with dApps on a computer, and the iPhone app on the go. Your recovery phrase is the backup for all of them.
          </p>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium" />
                  <th className="px-5 py-3 font-medium text-foreground">Extension</th>
                  <th className="px-5 py-3 font-medium text-foreground">Web</th>
                  <th className="px-5 py-3 font-medium text-foreground">iPhone</th>
                </tr>
              </thead>
              <tbody>
                {PLATFORM_ROWS.map((r) => (
                  <tr key={r.label} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 text-muted-foreground">{r.label}</td>
                    {r.values.map((v, i) => (
                      <td key={i} className={cn('px-5 py-3', v === '—' && 'text-muted-foreground/60')}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo className="h-6 w-6 rounded-md" />
            <span className="text-sm font-semibold">QRDX Wallet</span>
            <span className="text-xs text-muted-foreground">· open source, ISC License</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <a href={REPO_URL} className="hover:text-foreground">GitHub</a>
            <a href="https://docs.qrdx.org" className="hover:text-foreground">Docs</a>
            <a href="https://trade.qrdx.org" className="hover:text-foreground">Trade</a>
            <a href="https://explorer.qrdx.org" className="inline-flex items-center gap-1 hover:text-foreground">
              <Network className="h-3.5 w-3.5" /> Explorer
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
