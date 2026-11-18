'use client'

/**
 * Multisig (src/core/multisig.ts): set up an m-of-n multisig from its members' public keys,
 * propose a transaction it signs, sign as a member, and submit once enough members have.
 *
 * There is no server. A request (the unsigned transaction and the signatures so far) travels as
 * text or a file: the proposer shares it, each member opens it, signs and shares it back, and
 * whoever holds enough signatures submits. Any member's wallet can do any step.
 */

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Circle, FileUp, KeyRound, Loader2, Plus, Send, Share2, Trash2, Users } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { ExchangeOp, exchangeSigningBytes, type ExchangeOpName, type JsonValue } from '@/src/core/exchange-tx'
import { describeExchangeOp } from '@/src/core/exchange-describe'
import { waitForExchangeReceipt } from '@/src/core/exchange-client'
import { explainNodeError } from '@/src/core/fee-reserve'
import { accountAuthority, accountControlled, type Authority } from '@/src/core/qns'
import { prepareMultisigTx, submitMultisigTx } from '@/src/core/tx-service'
import {
  aggregateSignature,
  createKeyset,
  decodeRequest,
  encodeRequest,
  memberAddresses,
  requestId,
  requestKeyset,
  validPartials,
  type MultisigKeyset,
  type MultisigRequest,
} from '@/src/core/multisig'
import { dropRequest, forgetMultisig, keepRequest, openRequests, saveMultisig, savedMultisigs, type SavedMultisig } from '@/src/core/multisig-book'
import { CopyButton, ErrorBanner, Notice, PrimaryButton, Sheet, TextField } from '../flow/FlowKit'
import { Row, Section, Segmented, SettingsPage, saveFile } from './shared'
import { cn } from '@/lib/utils'

const short = (a: string) => `${a.slice(0, 10)}…${a.slice(-6)}`
const isSigner = (a: string) => /^0xPQ(MS)?[0-9a-fA-F]{38,}$/.test(a.trim())
const opName = (code: number) => (Object.keys(ExchangeOp) as ExchangeOpName[]).find((k) => ExchangeOp[k] === code)
const textareaClass =
  'w-full min-h-[96px] rounded-xl border border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary'

type View = { kind: 'list' } | { kind: 'multisig'; address: string } | { kind: 'request'; id: string }

export function MultisigPage({ onBack }: { onBack: () => void }) {
  const { activeChain, currentWallet } = useWallet()
  const [multisigs, setMultisigs] = useState<SavedMultisig[]>(() => savedMultisigs())
  const [requests, setRequests] = useState<MultisigRequest[]>(() => openRequests())
  const [view, setView] = useState<View>({ kind: 'list' })
  const [creating, setCreating] = useState(false)
  const [opening, setOpening] = useState(false)
  const reloadRequests = () => setRequests(openRequests())

  if (!isQrdxChain(activeChain)) {
    return (
      <SettingsPage title="Multisig" onBack={onBack}>
        <Notice>Multisigs exist on QRDX networks.</Notice>
      </SettingsPage>
    )
  }

  if (view.kind === 'multisig') {
    const ms = multisigs.find((m) => m.address === view.address)
    if (ms) {
      return (
        <MultisigDetail
          multisig={ms}
          onBack={() => setView({ kind: 'list' })}
          onForget={() => {
            setMultisigs(forgetMultisig(ms.address))
            setView({ kind: 'list' })
          }}
          onRequest={(req) => {
            keepRequest(req)
            reloadRequests()
            setView({ kind: 'request', id: requestId(req) })
          }}
        />
      )
    }
  }
  if (view.kind === 'request') {
    const req = requests.find((r) => safeId(r) === view.id)
    if (req) {
      return (
        <RequestView
          request={req}
          onBack={() => setView({ kind: 'list' })}
          onChange={(next) => {
            keepRequest(next)
            reloadRequests()
          }}
          onDone={() => {
            dropRequest(view.id)
            reloadRequests()
            setView({ kind: 'list' })
          }}
          onSaveMultisig={(k, name) => setMultisigs(saveMultisig(k, name))}
          known={multisigs.some((m) => m.address === requestSafeAddress(req))}
        />
      )
    }
  }

  const mine = currentWallet?.pqPublicKey.replace(/^0x/, '') ?? ''
  return (
    <SettingsPage title="Multisig" onBack={onBack}>
      <Notice icon={<Users className="h-4 w-4" />}>
        A multisig (0xPQMS…) needs m of its n members to sign. Bind one as a controller in Account control, and moving your funds takes several of your devices or people.
      </Notice>

      <Section title="Your member key">
        <Row
          icon={<KeyRound className="h-4 w-4" />}
          label={`${mine.slice(0, 12)}…${mine.slice(-8)}`}
          description="Public: give it to whoever sets up a multisig with you. It signs nothing by itself."
          right={<CopyButton text={mine} />}
        />
      </Section>

      <Section title="Your multisigs" action={<button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"><Plus className="h-3 w-3" /> Add</button>}>
        {multisigs.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">None on this device. Set one up from its members&apos; keys; the same keys always make the same multisig.</p>
        ) : (
          multisigs.map((m) => (
            <Row
              key={m.address}
              icon={<Users className="h-4 w-4" />}
              label={m.name}
              description={`${m.m} of ${m.n} · ${short(m.address)}${mine && m.publicKeys.includes(mine.toLowerCase()) ? ' · you are a member' : ''}`}
              onClick={() => setView({ kind: 'multisig', address: m.address })}
            />
          ))
        )}
      </Section>

      <Section title="Requests" action={<button type="button" onClick={() => setOpening(true)} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"><FileUp className="h-3 w-3" /> Open</button>}>
        {requests.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No requests. Open one a member shared with you, or start one from a multisig.</p>
        ) : (
          requests.map((r) => {
            const id = safeId(r)
            const signed = safeValid(r)
            return (
              <Row
                key={id}
                icon={<Send className="h-4 w-4" />}
                label={r.label || 'Multisig transaction'}
                description={`${signed} of ${r.keyset.m} signatures · ${short(requestSafeAddress(r))}${r.network !== activeChain.id ? ` · for ${r.network}` : ''}`}
                onClick={() => setView({ kind: 'request', id })}
              />
            )
          })
        )}
      </Section>

      {creating && (
        <CreateSheet
          ownKey={mine}
          onClose={() => setCreating(false)}
          onSave={(k, name) => {
            setMultisigs(saveMultisig(k, name))
            setCreating(false)
            setView({ kind: 'multisig', address: k.address })
          }}
        />
      )}
      {opening && (
        <OpenSheet
          onClose={() => setOpening(false)}
          onOpen={(req) => {
            const kept = keepRequest(req)
            reloadRequests()
            setOpening(false)
            setView({ kind: 'request', id: requestId(kept) })
          }}
        />
      )}
    </SettingsPage>
  )
}

function safeId(r: MultisigRequest): string {
  try {
    return requestId(r)
  } catch {
    return `${r.createdAt}`
  }
}

function safeValid(r: MultisigRequest): number {
  try {
    return validPartials(r).length
  } catch {
    return 0
  }
}

const requestSafeAddress = (r: MultisigRequest) => r.tx.signer ?? r.tx.sender

// ─── Set up ─────────────────────────────────────────────────────────────────

function CreateSheet({ ownKey, onClose, onSave }: { ownKey: string; onClose: () => void; onSave: (k: MultisigKeyset, name: string) => void }) {
  const [name, setName] = useState('')
  const [keys, setKeys] = useState('')
  const [includeMe, setIncludeMe] = useState(true)
  const [threshold, setThreshold] = useState('2')
  const listed = keys.split(/[\s,]+/).map((k) => k.trim().replace(/^0x/i, '').toLowerCase()).filter(Boolean)
  const all = includeMe && ownKey && !listed.includes(ownKey.toLowerCase()) ? [ownKey, ...listed] : listed
  const joined = all.join(',')
  const result = useMemo(() => {
    if (!joined) return null
    try {
      return { keyset: createKeyset(joined.split(','), Number(threshold)) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'These keys do not make a multisig' }
    }
  }, [joined, threshold])

  return (
    <Sheet title="Add a multisig" onClose={onClose}>
      <div className="space-y-3">
        <TextField label="Name" value={name} onChange={setName} placeholder="Cold storage" maxLength={40} />
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="ms-keys">
            Members&apos; keys, one per line
          </label>
          <textarea id="ms-keys" className={textareaClass} value={keys} onChange={(e) => setKeys(e.target.value)} placeholder="Each member copies theirs from Settings → Multisig" />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={includeMe} onChange={(e) => setIncludeMe(e.target.checked)} className="h-4 w-4 accent-current" />
          Include this account as a member
        </label>
        <TextField label={`Signatures needed (of ${all.length || 'n'})`} value={threshold} onChange={(v) => setThreshold(v.replace(/[^0-9]/g, ''))} />
        {result?.keyset && (
          <Notice>
            {result.keyset.m} of {result.keyset.n}: <span className="break-all font-mono text-foreground">{result.keyset.address}</span>
          </Notice>
        )}
        <ErrorBanner error={result?.error} />
        <PrimaryButton disabled={!result?.keyset} onClick={() => result?.keyset && onSave(result.keyset, name)}>
          Save multisig
        </PrimaryButton>
        <p className="text-[11px] text-muted-foreground">The address comes from the keys and the threshold alone: every member who enters the same ones gets the same multisig.</p>
      </div>
    </Sheet>
  )
}

function OpenSheet({ onClose, onOpen }: { onClose: () => void; onOpen: (r: MultisigRequest) => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const open = (value: string) => {
    try {
      onOpen(decodeRequest(value))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This is not a multisig request')
    }
  }
  return (
    <Sheet title="Open a request" onClose={onClose}>
      <div className="space-y-3">
        <textarea className={textareaClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="qrdx-multisig:v1:…" aria-label="Request text" />
        <ErrorBanner error={error} />
        <PrimaryButton disabled={!text.trim()} onClick={() => open(text)}>
          Open
        </PrimaryButton>
        <label className="flex cursor-pointer items-center justify-center gap-1.5 text-xs font-medium text-primary hover:underline">
          <FileUp className="h-3.5 w-3.5" /> Open a file
          <input
            type="file"
            accept=".txt,text/plain"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) open(await f.text())
            }}
          />
        </label>
      </div>
    </Sheet>
  )
}

// ─── A multisig ─────────────────────────────────────────────────────────────

type Action = 'send' | 'controller' | 'own_key' | 'cancel'

function MultisigDetail({ multisig, onBack, onForget, onRequest }: { multisig: SavedMultisig; onBack: () => void; onForget: () => void; onRequest: (r: MultisigRequest) => void }) {
  const { activeChain, currentWallet } = useWallet()
  const members = useMemo(() => memberAddresses(multisig), [multisig])
  const [controls, setControls] = useState<string[]>([])
  const [actFor, setActFor] = useState(multisig.address)
  const [target, setTarget] = useState<Authority | null>(null)
  const [action, setAction] = useState<Action>('send')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [controller, setController] = useState('')
  const [bind, setBind] = useState<'add' | 'remove'>('add')
  const [keyOn, setKeyOn] = useState<'off' | 'on'>('off')
  const [changeId, setChangeId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    accountControlled(activeChain, multisig.address)
      .then((c) => live && setControls(c?.controls ?? []))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [activeChain, multisig.address])
  useEffect(() => {
    let live = true
    setTarget(null)
    accountAuthority(activeChain, actFor)
      .then((a) => live && setTarget(a))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [activeChain, actFor])

  const self = actFor === multisig.address
  const request = (): { op: ExchangeOpName; params: Record<string, JsonValue>; label: string } | null => {
    if (action === 'send') {
      const t = to.trim()
      if (!/^0x[0-9a-zA-Z]{8,80}$/.test(t) || !(Number(amount) > 0)) return null
      return { op: 'TOKEN_TRANSFER', params: { token_address: 'QRDX', to: t, amount: amount.trim() }, label: `Send ${amount.trim()} QRDX to ${short(t)}` }
    }
    if (action === 'controller') {
      const c = controller.trim()
      if (!isSigner(c)) return null
      return { op: 'ACCOUNT_POLICY', params: { action: bind === 'add' ? 'add_controller' : 'remove_controller', controller: c }, label: `${bind === 'add' ? 'Bind' : 'Unbind'} controller ${short(c)}` }
    }
    if (action === 'own_key') return { op: 'ACCOUNT_POLICY', params: { action: 'own_key', enabled: keyOn === 'on' }, label: `Turn ${short(actFor)}'s own key ${keyOn}` }
    if (!changeId) return null
    return { op: 'ACCOUNT_POLICY', params: { action: 'cancel', change_id: changeId }, label: `Cancel waiting change ${changeId.slice(0, 8)}` }
  }
  const draft = request()

  const start = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      const tx = await prepareMultisigTx({ chain: activeChain, keyset: multisig, actFor, op: draft.op, params: draft.params })
      onRequest({ v: 1, network: activeChain.id, label: self ? draft.label : `${draft.label} for ${short(actFor)}`, keyset: { m: multisig.m, public_keys: multisig.publicKeys }, tx, partials: [], createdAt: Date.now() })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare the transaction')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsPage title={multisig.name} onBack={onBack}>
      <Section title={`${multisig.m} of ${multisig.n}`}>
        <Row icon={<Users className="h-4 w-4" />} label={short(multisig.address)} description="Its address" right={<CopyButton text={multisig.address} />} />
        {members.map((a) => (
          <Row key={a} icon={<KeyRound className="h-4 w-4" />} label={short(a)} description={a.toLowerCase() === currentWallet?.pqAddress.toLowerCase() ? 'You' : 'Member'} />
        ))}
      </Section>

      <Section title="New request">
        <div className="space-y-2 p-2">
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="ms-for">
            Signs for
          </label>
          <select id="ms-for" value={actFor} onChange={(e) => setActFor(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-2 text-sm">
            <option value={multisig.address}>The multisig itself</option>
            {controls.map((c) => (
              <option key={c} value={c}>
                {short(c)} (it controls)
              </option>
            ))}
          </select>
          <Segmented<Action>
            value={action}
            onChange={setAction}
            options={[
              { value: 'send', label: 'Send QRDX' },
              { value: 'controller', label: 'Controller' },
              { value: 'own_key', label: 'Own key' },
              { value: 'cancel', label: 'Cancel change' },
            ]}
          />
          {action === 'send' && (
            <>
              <TextField label="To" value={to} onChange={setTo} placeholder="0xPQ…" />
              <TextField label="Amount (QRDX)" value={amount} onChange={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} placeholder="0.0" />
            </>
          )}
          {action === 'controller' && (
            <>
              <Segmented<'add' | 'remove'> value={bind} onChange={setBind} options={[{ value: 'add', label: 'Bind' }, { value: 'remove', label: 'Unbind' }]} />
              <TextField label="Controller (0xPQ… or 0xPQMS…)" value={controller} onChange={setController} placeholder="0xPQ…" />
            </>
          )}
          {action === 'own_key' && (
            <Segmented<'off' | 'on'> value={keyOn} onChange={setKeyOn} options={[{ value: 'off', label: 'Turn off' }, { value: 'on', label: 'Turn on' }]} />
          )}
          {action === 'cancel' &&
            (target?.pending_changes.length ? (
              <select value={changeId} onChange={(e) => setChangeId(e.target.value)} aria-label="Waiting change" className="h-11 w-full rounded-xl border border-border bg-background px-2 text-sm">
                <option value="">Choose a waiting change</option>
                {target.pending_changes.map((c) => (
                  <option key={c.change_id} value={c.change_id}>
                    {c.action.replace(/_/g, ' ')} · {new Date(Number(c.due) * 1000).toLocaleString()}
                  </option>
                ))}
              </select>
            ) : (
              <p className="px-1 text-[11px] text-muted-foreground">{target ? 'Nothing is waiting on this account.' : 'Reading…'}</p>
            ))}
          {(action === 'controller' || action === 'own_key') && self && (
            <p className="px-1 text-[11px] text-muted-foreground">A multisig&apos;s own key is its members; this changes the policy of the multisig&apos;s account.</p>
          )}
          <ErrorBanner error={error} />
          <PrimaryButton disabled={!draft} loading={busy} onClick={start}>
            Start request
          </PrimaryButton>
        </div>
      </Section>

      <button type="button" onClick={onForget} className="flex w-full items-center justify-center gap-1.5 py-2 text-[11px] text-muted-foreground hover:text-red-500">
        <Trash2 className="h-3.5 w-3.5" /> Remove from this device
      </button>
    </SettingsPage>
  )
}

// ─── A request ──────────────────────────────────────────────────────────────

function RequestView({
  request,
  onBack,
  onChange,
  onDone,
  onSaveMultisig,
  known,
}: {
  request: MultisigRequest
  onBack: () => void
  onChange: (r: MultisigRequest) => void
  onDone: () => void
  onSaveMultisig: (k: MultisigKeyset, name: string) => void
  known: boolean
}) {
  const { activeChain, currentWallet, backend } = useWallet()
  const [busy, setBusy] = useState<'sign' | 'submit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [merge, setMerge] = useState('')
  const [submitted, setSubmitted] = useState<{ hash: string; status: 'pending' | 'done' | 'failed'; error?: string; block?: number } | null>(null)

  const parsed = useMemo(() => {
    try {
      const keyset = requestKeyset(request)
      return { keyset, valid: validPartials(request), members: memberAddresses(keyset) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'This request is damaged' }
    }
  }, [request])
  if ('error' in parsed) {
    return (
      <SettingsPage title="Request" onBack={onBack}>
        <ErrorBanner error={parsed.error} />
        <PrimaryButton variant="outline" onClick={onDone}>
          Remove it
        </PrimaryButton>
      </SettingsPage>
    )
  }
  const { keyset, valid, members } = parsed
  const op = opName(request.tx.op_type)
  const summary = op ? describeExchangeOp(op, request.tx.params, { tokens: {} }) : { headline: `Operation ${request.tx.op_type}`, details: [], warnings: [] }
  const myKey = currentWallet?.pqPublicKey.replace(/^0x/, '').toLowerCase() ?? ''
  const myIndex = keyset.publicKeys.indexOf(myKey)
  const signedByMe = valid.some((p) => p.signer_index === myIndex)
  const wrongNetwork = request.network !== activeChain.id || !isQrdxChain(activeChain)
  const text = encodeRequest({ ...request, partials: valid })
  const enough = valid.length >= keyset.m

  const sign = async () => {
    if (!currentWallet) return
    setBusy('sign')
    setError(null)
    try {
      const partial = await backend.signMultisigPartial({ m: keyset.m, publicKeys: keyset.publicKeys }, request.tx, currentWallet.id)
      onChange({ ...request, partials: [...valid, partial] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign')
    } finally {
      setBusy(null)
    }
  }

  const submit = async () => {
    setBusy('submit')
    setError(null)
    try {
      const signed = aggregateSignature(keyset, exchangeSigningBytes(request.tx), valid)
      const hash = await submitMultisigTx(activeChain, request.tx, signed)
      setSubmitted({ hash, status: 'pending' })
      waitForExchangeReceipt(activeChain, hash)
        .then((r) => setSubmitted({ hash, status: r.success ? 'done' : 'failed', error: r.error || undefined, block: r.block_height }))
        .catch((e) => setSubmitted({ hash, status: 'pending', error: explainNodeError((e as Error).message) }))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not submit'
      setError(/nonce/i.test(message) ? `${explainNodeError(message)}. Another transaction used this nonce first; start the request again.` : explainNodeError(message))
    } finally {
      setBusy(null)
    }
  }

  const addCopy = () => {
    try {
      const other = decodeRequest(merge)
      if (requestId(other) !== requestId(request)) throw new Error('That copy is for a different transaction')
      onChange({ ...request, partials: [...request.partials, ...other.partials] })
      setMerge('')
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This is not a copy of the same request')
    }
  }

  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: { text: string; title: string }) => Promise<void> }
    if (nav.share) {
      try {
        await nav.share({ title: request.label || 'QRDX multisig request', text })
        return
      } catch {
        /* cancelled, or not allowed: fall back to a file */
      }
    }
    await saveFile(`qrdx-multisig-${requestId(request).slice(0, 8)}.txt`, text, 'text/plain')
  }

  return (
    <SettingsPage title="Request" onBack={onBack}>
      <div className="rounded-xl border bg-background p-3">
        <p className="text-sm font-semibold leading-snug">{summary.headline}</p>
        <div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-[11px]">
          <Line k="Signed by" v={`${short(keyset.address)} (${keyset.m} of ${keyset.n})`} />
          {request.tx.signer && <Line k="Acting for" v={short(request.tx.sender)} />}
          {summary.details.map((d) => (
            <Line key={d.label} k={d.label} v={d.value} />
          ))}
          <Line k="Network" v={request.network} />
          <Line k="Nonce" v={String(request.tx.nonce)} />
        </div>
      </div>
      {summary.warnings.map((w) => (
        <Notice key={w} tone="warning">
          {w}
        </Notice>
      ))}
      {wrongNetwork && <Notice tone="warning">This request is for {request.network}. Switch to that network to sign or submit it.</Notice>}
      {!known && (
        <button type="button" onClick={() => onSaveMultisig(keyset, 'Multisig')} className="w-full text-center text-[11px] font-medium text-primary hover:underline">
          Save this multisig on this device
        </button>
      )}

      <Section title={`Signatures: ${valid.length}, ${keyset.m} needed`}>
        {members.map((a, i) => {
          const done = valid.some((p) => p.signer_index === i)
          return (
            <Row
              key={a}
              icon={done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              label={short(a)}
              description={`${i === myIndex ? 'You · ' : ''}${done ? 'Signed' : 'Not yet'}`}
            />
          )
        })}
      </Section>

      <div className="space-y-2">
        {myIndex >= 0 && !signedByMe && !enough && (
          <PrimaryButton loading={busy === 'sign'} disabled={wrongNetwork || !!busy} onClick={sign}>
            Sign as a member
          </PrimaryButton>
        )}
        {enough && !submitted && (
          <PrimaryButton loading={busy === 'submit'} disabled={wrongNetwork || !!busy} onClick={submit}>
            Submit
          </PrimaryButton>
        )}
        {submitted && (
          <Notice tone={submitted.status === 'done' ? 'success' : submitted.status === 'failed' ? 'warning' : 'info'} icon={submitted.status === 'pending' ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
            {submitted.status === 'pending'
              ? (submitted.error ?? `Submitted (${submitted.hash.slice(0, 10)}…). Waiting for the next block.`)
              : submitted.status === 'done'
                ? `Executed in block ${submitted.block}.`
                : `Failed: ${submitted.error ?? 'the node refused it'}`}
          </Notice>
        )}
        {submitted?.status === 'done' && <PrimaryButton onClick={onDone}>Done</PrimaryButton>}
        <ErrorBanner error={error} />
        {!enough && (
          <p className="px-1 text-[11px] text-muted-foreground">
            {myIndex < 0 ? 'This account is not a member. ' : signedByMe ? 'You signed. ' : ''}Share the request with the other members; each signs and shares it back.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={share} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border text-xs font-medium hover:bg-accent">
            <Share2 className="h-3.5 w-3.5" /> Share
          </button>
          <div className="flex h-10 items-center justify-center rounded-xl border">
            <CopyButton text={text} label="Copy text" />
          </div>
        </div>
      </div>

      {!enough && (
        <Section title="Add signatures from another copy">
          <div className="space-y-2 p-2">
            <textarea className={cn(textareaClass, 'min-h-[64px]')} value={merge} onChange={(e) => setMerge(e.target.value)} placeholder="qrdx-multisig:v1:…" aria-label="Another copy of this request" />
            <PrimaryButton variant="outline" disabled={!merge.trim()} onClick={addCopy}>
              Add signatures
            </PrimaryButton>
          </div>
        </Section>
      )}

      <button type="button" onClick={onDone} className="flex w-full items-center justify-center gap-1.5 py-2 text-[11px] text-muted-foreground hover:text-red-500">
        <Trash2 className="h-3.5 w-3.5" /> Remove this request
      </button>
    </SettingsPage>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 truncate text-right font-mono">{v}</span>
    </div>
  )
}
