'use client'

import { CtaButton } from '@/components/motion/CtaButton'
import { Segment } from '@/components/motion/Segment'
import { Select } from '@/components/motion/Select'
import { Switch } from '@/components/motion/Switch'
import { UndoButton } from '@/components/motion/UndoButton'
import { BubblePanel } from '@/components/gfx/Bubble'
import { useMemo, useState, type ReactNode } from 'react'
import { BellOff, Plus, X } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import {
  notificationPermission,
  readNotifyPrefs,
  requestNotificationPermission,
  writeNotifyPrefs,
  type NotifyPrefs,
  type PermissionState,
  type PriceAlert,
} from '@/src/core/notify'
import { formatFiat } from '@/src/core/fiat'

/**
 * What the wallet notifies about (src/core/notify.ts): the account's transactions, and price
 * alerts set here. Turning either on asks for the system's notification permission.
 */
export function NotificationsPage({ header }: { header: ReactNode }) {
  const { prices } = useWallet()
  const [prefs, setPrefsState] = useState<NotifyPrefs>(() => readNotifyPrefs())
  const [permission, setPermission] = useState<PermissionState>(() => notificationPermission())
  const [symbol, setSymbol] = useState('QRDX')
  const [direction, setDirection] = useState<PriceAlert['direction']>('above')
  const [price, setPrice] = useState('')
  const priced = useMemo(() => [...prices.keys()].sort(), [prices])

  const setPrefs = (next: NotifyPrefs) => {
    setPrefsState(next)
    writeNotifyPrefs(next)
  }

  const toggle = async (key: 'transactions' | 'priceAlerts' | 'security', on: boolean) => {
    if (on) setPermission(await requestNotificationPermission())
    setPrefs({ ...prefs, [key]: on })
  }

  const value = Number(price)
  const current = prices.get(symbol.toUpperCase())?.usd
  const canAdd = Number.isFinite(value) && value > 0 && priced.includes(symbol.toUpperCase())

  const addAlert = () => {
    if (!canAdd) return
    setPrefs({
      ...prefs,
      priceAlerts: true,
      alerts: [...prefs.alerts, { id: `${Date.now()}`, symbol: symbol.toUpperCase(), direction, price: value, createdAt: Date.now() }],
    })
    setPrice('')
    if (permission === 'default') void requestNotificationPermission().then(setPermission)
  }

  return (
    <div className="min-h-screen wallet-screen">
      {header}
      <div className="space-y-3 px-4 py-3">
        {permission === 'denied' && (
          <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            <BellOff className="mt-px h-3.5 w-3.5 shrink-0" />
            Notifications are blocked for this app. Allow them in your browser or system settings to receive them.
          </p>
        )}
        {permission === 'unsupported' && (
          <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            This browser cannot show notifications. On iPhone, add the wallet to your Home Screen first.
          </p>
        )}

        <BubblePanel className="rounded-xl glass p-1.5" radius={16}>
          <Toggle label="Transactions" description="Funds received, and your sends when they confirm or fail" checked={prefs.transactions} onChange={(v) => void toggle('transactions', v)} />
          <Toggle label="Price alerts" description="When a token crosses a price you set below" checked={prefs.priceAlerts} onChange={(v) => void toggle('priceAlerts', v)} />
          <Toggle
            label="Account security"
            description="A waiting change to who may sign for your account, a recovery by your guardians, a new controller"
            checked={prefs.security && permission === 'granted'}
            onChange={(v) => void toggle('security', v)}
          />
        </BubblePanel>

        <BubblePanel as="section" className="rounded-xl glass p-3" radius={16}>
          <p className="mb-2 text-xs font-semibold">Price alerts</p>
          {prefs.alerts.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No alerts set.</p>
          ) : (
            <div className="space-y-1.5">
              {prefs.alerts.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-2 text-xs">
                  <span>
                    <span className="font-semibold">{a.symbol}</span> {a.direction} {formatFiat(a.price)}
                  </span>
                  <UndoButton label="Remove" what={`${a.symbol} alert`} icon={<X className="h-3.5 w-3.5" />} onRemove={() => setPrefs({ ...prefs, alerts: prefs.alerts.filter((x) => x.id !== a.id) })} />
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <Select label="Token" size="md" value={symbol} onChange={setSymbol} options={(priced.length ? priced : ['QRDX']).map((s) => ({ value: s, label: s }))} />
            <Segment<PriceAlert['direction']>
              label="Alert when the price is"
              size="sm"
              fill={false}
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'above', label: 'Above' },
                { value: 'below', label: 'Below' },
              ]}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <input
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="Price in USD"
              aria-label="Alert price in USD"
              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm tabular-nums"
            />
            <CtaButton onClick={addAlert} disabled={!canAdd} className="h-10 px-3 text-sm" size="sm">
              <Plus className="h-4 w-4" /> Add
            </CtaButton>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {current != null ? `${symbol} is at ${formatFiat(current)} now. ` : ''}An alert fires once, while the wallet is open; prices are compared in USD.
          </p>
        </BubblePanel>
      </div>
    </div>
  )
}

/** A setting's row: its words, and its switch (components/motion/Switch.tsx). Tapping the words flips it too. */
function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex w-full items-center gap-3 rounded-lg p-3 hover:bg-accent/30">
      <span className="min-w-0 flex-1 cursor-pointer" onClick={() => onChange(!checked)}>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{description}</span>
      </span>
      <Switch label={label} checked={checked} onChange={onChange} />
    </div>
  )
}
