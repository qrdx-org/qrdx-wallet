'use client'

/**
 * Who may sign for this account (qrdx-node docs/ACCOUNT_CONTROL.md): controllers (other wallets,
 * or a multisig, that may sign anything for it), its own key (which can be turned off), a delay
 * on changes its own key makes, recovery guardians, the changes waiting out that delay, and the
 * trading agents it approved. Every change is an ACCOUNT_POLICY (or AGENT_REVOKE) signed here.
 */

import { Loading } from '@/components/motion/Loading'
import { useEffect, useState } from 'react'
import { Clock, KeyRound, ShieldAlert, ShieldCheck, Users, Zap } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { accountAuthority, accountControlled, type Authority } from '@/src/core/qns'
import { nodeFeatures } from '@/src/core/tx-service'
import type { JsonValue } from '@/src/core/exchange-tx'
import { useTradeSubmit, SubmissionList } from '../trade/submit'
import { Notice, PrimaryButton, Sheet, TextField } from '../flow/FlowKit'
import { Row, Section, Segmented, SettingsPage } from './shared'

const short = (a: string) => `${a.slice(0, 10)}…${a.slice(-6)}`
const isSigner = (a: string) => /^0xPQ(MS)?[0-9a-fA-F]{40,}$/.test(a.trim())
const DELAYS = [
  { value: '0', label: 'None' },
  { value: '3600', label: '1 h' },
  { value: '86400', label: '1 day' },
  { value: '604800', label: '7 days' },
] as const
/** An agent approval's end, said for a person (0: until revoked). */
const untilText = (until: number) => (until === 0 ? 'until revoked' : until * 1000 < Date.now() ? 'expired' : `until ${new Date(until * 1000).toLocaleDateString()}`)
const span = (s: number) => (s >= 86400 ? `${Math.round(s / 86400)} day${s >= 172800 ? 's' : ''}` : s >= 3600 ? `${Math.round(s / 3600)} h` : `${s} s`)

export function AccountControlPage({ onBack }: { onBack: () => void }) {
  const { activeChain, currentWallet } = useWallet()
  const me = currentWallet?.pqAddress ?? ''
  const { ask, sheet, submissions } = useTradeSubmit()
  const [supported, setSupported] = useState<boolean | null>(null)
  const [auth, setAuth] = useState<Authority | null>(null)
  const [controller, setController] = useState('')
  const [guardians, setGuardians] = useState('')
  const [threshold, setThreshold] = useState('2')
  const [guarding, setGuarding] = useState<string[]>([])
  const [guarded, setGuarded] = useState<string | null>(null)

  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!isQrdxChain(activeChain) || !me) return
    let live = true
    nodeFeatures(activeChain).then(async (f) => {
      if (!live) return
      setSupported(f.trading)
      if (f.trading) {
        const [a, c] = await Promise.all([accountAuthority(activeChain, me).catch(() => null), accountControlled(activeChain, me).catch(() => null)])
        if (!live) return
        setAuth(a)
        setGuarding(c?.guardian_of ?? [])
      }
    })
    return () => {
      live = false
    }
  }, [activeChain, me, tick])
  const refreshSoon = () => setTimeout(() => setTick((n) => n + 1), 1500)
  const policy = (params: Record<string, JsonValue>, label: string) => ask({ op: 'ACCOUNT_POLICY', params, label, onDone: refreshSoon })

  if (!isQrdxChain(activeChain)) {
    return (
      <SettingsPage title="Account control" onBack={onBack}>
        <Notice>Account control exists on QRDX networks.</Notice>
      </SettingsPage>
    )
  }
  const waits = !!auth && auth.delay > 0
  const guardianList = guardians.split(/[\s,]+/).filter(Boolean)
  const recovery = auth?.pending_changes.find((c) => c.action === 'recover')

  return (
    <SettingsPage title="Account control" onBack={onBack}>
      {supported === false ? (
        <Notice>{activeChain.name}&apos;s node predates account control.</Notice>
      ) : !auth ? (
        <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
          <Loading label={`Reading ${short(me || '0x')}`} />
        </p>
      ) : (
        <>
          {recovery && (
            <Notice tone="warning" icon={<ShieldAlert className="h-4 w-4 text-amber-500" />}>
              Your guardians started a recovery of this account. On {new Date(Number(recovery.due) * 1000).toLocaleString()},{' '}
              {typeof recovery.value === 'string' ? short(recovery.value) : 'a new controller'} replaces every controller and this key is turned off. If you did not ask for
              this, cancel it below.
            </Notice>
          )}
          <Notice icon={<ShieldCheck className="h-4 w-4" />}>
            Bind a cold wallet (or a multisig of your devices) as a controller, add a delay, and a stolen key&apos;s changes sit in the open where the controller can cancel them,
            or turn the stolen key off at once.
          </Notice>

          <Section title="Controllers">
            {auth.controllers.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">None: only this account&apos;s own key signs for it.</p>
            ) : (
              auth.controllers.map((c) => (
                <Row
                  key={c.address}
                  icon={<Users className="h-4 w-4" />}
                  label={short(c.address)}
                  description={c.members ? `${c.members.threshold}-of-${c.members.members.length} multisig: may sign anything for this account` : 'May sign anything for this account'}
                  right={
                    <button type="button" className="text-[11px] text-red-500 hover:underline" onClick={() => policy({ action: 'remove_controller', controller: c.address }, `Unbind controller ${short(c.address)}`)}>
                      Remove
                    </button>
                  }
                />
              ))
            )}
            <div className="space-y-2 p-2">
              <TextField label="Add a controller (0xPQ… or 0xPQMS…)" value={controller} onChange={setController} placeholder="0xPQ…" />
              <PrimaryButton
                disabled={!isSigner(controller) || controller.trim().toLowerCase() === me.toLowerCase() || auth.controllers.length >= 5}
                onClick={() => policy({ action: 'add_controller', controller: controller.trim() }, `Bind ${short(controller.trim())} as a controller`)}
              >
                Bind controller
              </PrimaryButton>
              {waits && <p className="text-[11px] text-muted-foreground">Signed here, it waits {span(auth.delay)} before it applies.</p>}
            </div>
          </Section>

          <Section title="This account's own key">
            <Row
              icon={auth.own_key ? <KeyRound className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              label={auth.own_key ? 'On: this key signs for the account' : 'Off: only controllers sign'}
              description={auth.own_key ? 'Turn it off once a controller is bound, and this key moves nothing: not on the exchange, not in the EVM.' : undefined}
              right={
                auth.own_key && auth.controllers.length > 0 ? (
                  <button type="button" className="text-[11px] text-red-500 hover:underline" onClick={() => policy({ action: 'own_key', enabled: false }, "Turn this account's own key off")}>
                    Turn off
                  </button>
                ) : undefined
              }
            />
          </Section>

          <Section title="Delay on changes signed here">
            <div className="space-y-2 p-2">
              <Segmented
                label="Delay on changes"
                value={(DELAYS.find((d) => Number(d.value) === auth.delay)?.value ?? '0') as (typeof DELAYS)[number]['value']}
                options={DELAYS.map((d) => ({ value: d.value, label: d.label }))}
                onChange={(v) => Number(v) !== auth.delay && policy({ action: 'delay', seconds: Number(v) }, `Make changes signed here wait ${v === '0' ? 'no time' : span(Number(v))}`)}
              />
              <p className="text-[11px] text-muted-foreground">Now {auth.delay ? span(auth.delay) : 'none'}. Lengthening applies at once; shortening waits out the current delay.</p>
            </div>
          </Section>

          <Section title="Recovery guardians">
            {auth.guardians ? (
              <Row
                icon={<Users className="h-4 w-4" />}
                label={`${auth.guardians.threshold} of ${auth.guardians.addresses.length} guardians`}
                description={`Together they can hand this account to a new controller after ${span(auth.guardians.recovery_delay)}, unless you cancel.`}
                right={
                  <button type="button" className="text-[11px] text-red-500 hover:underline" onClick={() => policy({ action: 'guardians', guardians: [] }, 'Remove the recovery guardians')}>
                    Remove
                  </button>
                }
              />
            ) : (
              <div className="space-y-2 p-2">
                <TextField label="Guardians (0xPQ… addresses, up to 7)" value={guardians} onChange={setGuardians} placeholder="0xPQ…, 0xPQ…" />
                <TextField label="How many must agree" value={threshold} onChange={(v) => setThreshold(v.replace(/[^0-9]/g, ''))} />
                <PrimaryButton
                  disabled={!guardianList.length || guardianList.length > 7 || !guardianList.every(isSigner) || !(Number(threshold) >= 1 && Number(threshold) <= guardianList.length)}
                  onClick={() =>
                    policy({ action: 'guardians', guardians: guardianList, threshold: Number(threshold), recovery_delay: 604800 }, `Name ${guardianList.length} recovery guardians`)
                  }
                >
                  Name guardians
                </PrimaryButton>
              </div>
            )}
          </Section>

          {auth.pending_changes.length > 0 && (
            <Section title="Waiting changes">
              {auth.pending_changes.map((c) => (
                <Row
                  key={c.change_id}
                  icon={c.action === 'recover' ? <ShieldAlert className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  danger={c.action === 'recover'}
                  label={c.action === 'recover' ? 'Recovery by your guardians' : c.action.replace(/_/g, ' ')}
                  description={`Applies ${new Date(Number(c.due) * 1000).toLocaleString()}${typeof c.value === 'string' ? ` · ${short(c.value)}` : ''}`}
                  right={
                    <button type="button" className="text-[11px] text-red-500 hover:underline" onClick={() => policy({ action: 'cancel', change_id: c.change_id }, `Cancel the waiting ${c.action.replace(/_/g, ' ')}`)}>
                      Cancel
                    </button>
                  }
                />
              ))}
            </Section>
          )}

          <Section title="Trading agents">
            {auth.agents.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">None. A trading site&apos;s one-click trading or a bot adds one; it can trade, never withdraw.</p>
            ) : (
              auth.agents.map((a) => {
                const until = Number(a.valid_until)
                return (
                  <Row
                    key={a.agent}
                    icon={<Zap className="h-4 w-4" />}
                    label={a.name || short(a.agent)}
                    description={`${short(a.agent)} · ${untilText(until)}`}
                    right={
                      <button type="button" className="text-[11px] text-red-500 hover:underline" onClick={() => ask({ op: 'AGENT_REVOKE', params: { agent: a.agent }, label: `Revoke agent ${short(a.agent)}`, onDone: refreshSoon })}>
                        Revoke
                      </button>
                    }
                  />
                )
              })
            )}
          </Section>
          {guarding.length > 0 && (
            <Section title="Accounts you guard">
              {guarding.map((a) => (
                <Row key={a} icon={<Users className="h-4 w-4" />} label={short(a)} description="You are one of its recovery guardians" onClick={() => setGuarded(a)} />
              ))}
            </Section>
          )}
          <SubmissionList items={submissions} />
        </>
      )}
      {guarded && (
        <GuardianSheet
          account={guarded}
          onClose={() => setGuarded(null)}
          onBack={(newController) => {
            setGuarded(null)
            ask({
              op: 'ACCOUNT_RECOVER',
              params: { account: guarded, new_controller: newController },
              label: newController ? `Back ${short(newController)} to recover ${short(guarded)}` : `Withdraw your recovery backing for ${short(guarded)}`,
              onDone: refreshSoon,
            })
          }}
        />
      )}
      {sheet}
    </SettingsPage>
  )
}

/**
 * Acting as a guardian of `account` (qrdx-node docs/ACCOUNT_CONTROL.md §6): back a new controller
 * for it, or withdraw the backing. When enough guardians back the same one, the recovery waits
 * out its delay, during which the account's owner can cancel it.
 */
function GuardianSheet({ account, onClose, onBack }: { account: string; onClose: () => void; onBack: (newController: string) => void }) {
  const { activeChain, currentWallet } = useWallet()
  const [auth, setAuth] = useState<Authority | null>(null)
  const [next, setNext] = useState('')
  useEffect(() => {
    let live = true
    accountAuthority(activeChain, account)
      .then((a) => live && setAuth(a))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [activeChain, account])
  const recovery = auth?.pending_changes.find((c) => c.action === 'recover')
  const target = next.trim()
  const valid = isSigner(target) && target.toLowerCase() !== account.toLowerCase() && target.toLowerCase() !== currentWallet?.pqAddress.toLowerCase()

  return (
    <Sheet title="Recover an account" onClose={onClose}>
      <div className="space-y-3">
        <p className="break-all font-mono text-[11px] text-muted-foreground">{account}</p>
        {!auth ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loading label="Reading its guardians" />
          </p>
        ) : auth.guardians ? (
          <Notice>
            {auth.guardians.threshold} of its {auth.guardians.addresses.length} guardians must back the same new controller. The recovery then waits{' '}
            {span(auth.guardians.recovery_delay)}, and the owner can cancel it in that time. Only do this when the owner asks you to: they lost every key.
          </Notice>
        ) : (
          <Notice tone="warning">This account no longer names guardians.</Notice>
        )}
        {recovery && (
          <Notice tone="warning" icon={<Clock className="h-4 w-4 text-amber-500" />}>
            A recovery to {typeof recovery.value === 'string' ? short(recovery.value) : 'a new controller'} is waiting; it applies{' '}
            {new Date(Number(recovery.due) * 1000).toLocaleString()}.
          </Notice>
        )}
        <TextField label="New controller the owner gave you (0xPQ… or 0xPQMS…)" value={next} onChange={setNext} placeholder="0xPQ…" />
        <PrimaryButton disabled={!valid || !auth?.guardians} onClick={() => onBack(target)}>
          Back this controller
        </PrimaryButton>
        <button type="button" onClick={() => onBack('')} className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground hover:underline">
          Withdraw my backing
        </button>
      </div>
    </Sheet>
  )
}
