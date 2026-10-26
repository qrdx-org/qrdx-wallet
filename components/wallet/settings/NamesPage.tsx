'use client'

/**
 * QRDX names (label.qrdx; qrdx-node docs/QNS.md): register one, renew it, point it at this
 * account, and choose the account's primary name (what explorers and other wallets show for
 * it). A name is a native NFT: whoever holds it decides where it points.
 */

import { useEffect, useState } from 'react'
import { AtSign, Loader2 } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { QNS_NAME, qnsGetName, qnsLengthFactor, qnsNamesOf, qnsPrice, reverseQns, type QnsNameInfo } from '@/src/core/qns'
import { nodeFeatures } from '@/src/core/tx-service'
import { useTradeSubmit, SubmissionList } from '../trade/submit'
import { Notice, PrimaryButton, TextField } from '../flow/FlowKit'
import { Row, Section, Segmented, SettingsPage } from './shared'

const YEARS = [
  { value: '1', label: '1 year' },
  { value: '2', label: '2' },
  { value: '5', label: '5' },
  { value: '10', label: '10' },
] as const

const fmt = (t: string | number | undefined) => (t ? new Date(Number(t) * 1000).toLocaleDateString() : '—')
const full = (label: string) => (label.toLowerCase().endsWith('.qrdx') ? label.toLowerCase() : `${label.toLowerCase()}.qrdx`)

export function NamesPage({ onBack }: { onBack: () => void }) {
  const { activeChain, currentWallet } = useWallet()
  const me = currentWallet?.pqAddress ?? ''
  const { ask, sheet, submissions } = useTradeSubmit()
  const [supported, setSupported] = useState<boolean | null>(null)
  const [primary, setPrimary] = useState<string | null>(null)
  const [names, setNames] = useState<QnsNameInfo[] | null>(null)
  const [label, setLabel] = useState('')
  const [years, setYears] = useState<string>('1')
  const [checked, setCheck] = useState<{ name: string; years: string; taken: QnsNameInfo | null; price: string | null } | null>(null)

  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!isQrdxChain(activeChain) || !me) return
    let live = true
    nodeFeatures(activeChain).then(async (f) => {
      if (!live) return
      setSupported(f.trading)
      if (!f.trading) return
      const [p, list] = await Promise.all([reverseQns(activeChain, me, true), qnsNamesOf(activeChain, me)])
      const infos = await Promise.all((list ?? []).map((n) => qnsGetName(activeChain, n).catch(() => null)))
      if (!live) return
      setPrimary(p)
      setNames(infos.filter((x): x is QnsNameInfo => !!x))
    })
    return () => {
      live = false
    }
  }, [activeChain, me, tick])

  // Availability and price as the name is typed.
  const name = full(label.trim())
  const valid = QNS_NAME.test(name)
  const check = valid && supported && checked?.name === name && checked.years === years ? checked : null
  useEffect(() => {
    if (!valid || !supported) return
    let live = true
    const t = setTimeout(async () => {
      const [taken, base] = await Promise.all([qnsGetName(activeChain, name).catch(() => null), qnsPrice(activeChain, Number(years)).catch(() => null)])
      const price = base ? String(Number(base) * qnsLengthFactor(name)) : null
      if (live) setCheck({ name, years, taken, price })
    }, 300)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [name, valid, years, supported, activeChain])

  const refreshSoon = () => setTimeout(() => setTick((n) => n + 1), 1500)

  if (!isQrdxChain(activeChain)) {
    return (
      <SettingsPage title="Names" onBack={onBack}>
        <Notice>Names exist on QRDX networks. Switch to one to register or manage a name.</Notice>
      </SettingsPage>
    )
  }

  return (
    <SettingsPage title="Names" onBack={onBack}>
      {supported === false ? (
        <Notice>{activeChain.name} has no QRDX names yet: its node predates them.</Notice>
      ) : supported === null ? (
        <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking {activeChain.name}…
        </p>
      ) : (
        <>
          <Section title="This account">
            <Row icon={<AtSign className="h-4 w-4" />} label={primary ?? 'No primary name'} description={primary ? 'Shown for this account by explorers and other wallets' : 'Choose one of your names below'} />
          </Section>

          <Section title="Your names">
            {names === null ? (
              <p className="p-3 text-xs text-muted-foreground">Loading…</p>
            ) : names.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">None yet.</p>
            ) : (
              names.map((n) => {
                const pointsHere = (n.records.address ?? '').toLowerCase() === me.toLowerCase()
                return (
                  <div key={n.name} className="rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{n.name}</span>
                      <span className="text-[11px] text-muted-foreground">until {fmt(n.expires)}</span>
                    </div>
                    <p className="mt-0.5 break-all text-[11px] text-muted-foreground">
                      {n.records.address ? `Points to ${pointsHere ? 'this account' : n.records.address}` : 'Points nowhere'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {!pointsHere && (
                        <Chip onClick={() => ask({ op: 'QNS_SET_RECORD', params: { name: n.name, key: 'address', value: me }, label: `Point ${n.name} here`, onDone: refreshSoon })}>Point here</Chip>
                      )}
                      {primary !== n.name && pointsHere && (
                        <Chip onClick={() => ask({ op: 'QNS_SET_PRIMARY', params: { name: n.name }, label: `Show this account as ${n.name}`, onDone: refreshSoon })}>Make primary</Chip>
                      )}
                      <Chip onClick={() => ask({ op: 'QNS_RENEW', params: { name: n.name, years: 1 }, label: `Renew ${n.name} for a year`, onDone: refreshSoon })}>Renew a year</Chip>
                    </div>
                  </div>
                )
              })
            )}
            {primary && (
              <div className="px-3 pb-2">
                <Chip onClick={() => ask({ op: 'QNS_SET_PRIMARY', params: { name: '' }, label: 'Clear the primary name', onDone: refreshSoon })}>Clear primary name</Chip>
              </div>
            )}
          </Section>

          <Section title="Register a name">
            <div className="space-y-3 p-2">
              <TextField label="Name" value={label} onChange={(v) => setLabel(v.toLowerCase().replace(/[^a-z0-9.-]/g, ''))} placeholder="yourname.qrdx" maxLength={64} />
              <Segmented value={years} options={YEARS.map((y) => ({ value: y.value, label: y.label }))} onChange={setYears} />
              <p className="text-[11px] text-muted-foreground">
                {!label
                  ? '3–59 of a-z, 0-9 and "-". A year costs 0.0125 QRDX for 5 or more characters, more for shorter names.'
                  : !valid
                    ? 'A name is 3–59 of a-z, 0-9 and "-", not starting or ending with "-".'
                    : !check || check.name !== name
                      ? 'Checking…'
                      : check.taken
                        ? `${name} is taken (until ${fmt(check.taken.expires)}).`
                        : `${name} is free: ${check.price ?? '?'} QRDX for ${years} year${years === '1' ? '' : 's'}, paid to the treasury.`}
              </p>
              <PrimaryButton
                disabled={!valid || !check || check.name !== name || !!check.taken}
                onClick={() =>
                  ask({
                    op: 'QNS_REGISTER',
                    params: { name, years: Number(years) },
                    label: `Register ${name}`,
                    estimates: check?.price ? [{ k: 'Price', v: `${check.price} QRDX` }] : undefined,
                    onDone: () => {
                      setLabel('')
                      refreshSoon()
                    },
                  })
                }
              >
                Register {valid ? name : ''}
              </PrimaryButton>
            </div>
          </Section>
          <SubmissionList items={submissions} />
        </>
      )}
      {sheet}
    </SettingsPage>
  )
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border px-2.5 py-1 text-[11px] font-medium hover:bg-accent/50">
      {children}
    </button>
  )
}
