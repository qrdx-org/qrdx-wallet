'use client'

/**
 * Extension approval window (`popup/index.html#approval=<id>`).
 *
 * Shows one dApp request in plain language and returns the user's decision to
 * the background, which does the signing. The site's origin shown here comes
 * from the browser, not from the page, and is the one thing users should
 * always check.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FileSignature,
  Globe,
  Link2,
  Network,
  Coins,
  Send,
  Shield,
  Repeat,
} from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { approvals, type ApprovalRequest, type ApprovalResult } from '@/src/extension/provider/approval-protocol'
import { getChain } from '@/src/core/chains'
import { weiToEth } from '@/src/core/ethereum'
import { shortenAddress } from '@/src/core/address'
import { ErrorBanner, FlowScreen, Notice, PrimaryButton } from '../flow/FlowKit'

const MAX_UINT_HALF = 1n << 255n

function decodeCalldata(data: string): { label: string; detail?: string; warning?: string } | null {
  if (!data || data === '0x') return null
  const sel = data.slice(0, 10).toLowerCase()
  const arg = (i: number) => data.slice(10 + i * 64, 10 + (i + 1) * 64)
  if (sel === '0xa9059cbb' && data.length >= 138) {
    return {
      label: 'Token transfer',
      detail: `to 0x${arg(0).slice(24)} · amount ${BigInt('0x' + arg(1)).toString()} (base units)`,
    }
  }
  if (sel === '0x095ea7b3' && data.length >= 138) {
    const amount = BigInt('0x' + arg(1))
    return {
      label: 'Token approval',
      detail: `spender 0x${arg(0).slice(24)}`,
      warning:
        amount >= MAX_UINT_HALF
          ? 'Unlimited approval: this contract could move ALL of this token from your account, now or later.'
          : amount === 0n
            ? undefined
            : `Allows spending ${amount.toString()} base units.`,
    }
  }
  return { label: `Contract call ${sel}`, detail: `${(data.length - 2) / 2} bytes of data` }
}

function humanMessage(
  message: string,
  encoding: 'utf8' | 'hex'
): { text: string; binary: boolean } {
  if (encoding === 'utf8') return { text: message, binary: false }
  try {
    const bytes = Uint8Array.from((message.slice(2).match(/../g) ?? []).map((h) => parseInt(h, 16)))
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (/[\x00-\x08\x0e-\x1f]/.test(text)) throw new Error('binary')
    return { text, binary: false }
  } catch {
    return { text: message, binary: true }
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-[12px]">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right break-all font-medium">{children}</span>
    </div>
  )
}

/**
 * Review one dApp request. Two hosts: the extension's approval window (`id`:
 * the request is fetched from the background and the window closes when done),
 * and QRDX Connect in the web / PWA wallet (`request` + `onResolve`, shown in
 * the page; `remote` adds the scanned-code warning to connect requests).
 */
export function ApprovalScreen(
  props: { id: string } | { request: ApprovalRequest; onResolve: (r: ApprovalResult) => void; remote?: boolean }
) {
  const w = useWallet()
  const id = 'id' in props ? props.id : null
  const [request, setRequest] = useState<ApprovalRequest | null>('request' in props ? props.request : null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Which accounts a connect request shares: the current one until the user changes it.
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const selected = picked ?? new Set(w.currentWallet ? [w.currentWallet.id] : [])
  const [busy, setBusy] = useState(false)
  const remote = 'remote' in props && !!props.remote

  const finish = async (result: ApprovalResult) => {
    if ('onResolve' in props) return props.onResolve(result)
    await approvals.resolve(id!, result).catch(() => undefined)
    window.close()
  }

  useEffect(() => {
    if (!id) return
    approvals
      .get(id)
      .then(setRequest, (e) => setLoadError(e instanceof Error ? e.message : 'Request not found'))
  }, [id])

  // An unlock request is satisfied the moment the wallet is unlocked.
  useEffect(() => {
    if (request?.kind === 'unlock' && !w.locked) void finish({ approved: true })
  }, [request, w.locked]) // eslint-disable-line react-hooks/exhaustive-deps

  const account = useMemo(
    () =>
      request && 'account' in request
        ? w.allWallets.find((a) => a.id === request.account)
        : undefined,
    [request, w.allWallets]
  )

  const respond = async (approved: boolean) => {
    setBusy(true)
    await finish(
      approved && request?.kind === 'connect'
        ? { approved: true, accountIds: [...selected] }
        : approved
          ? { approved: true }
          : { approved: false }
    )
    setBusy(false)
  }

  if (loadError) {
    return (
      <FlowScreen className="justify-center">
        <ErrorBanner error={loadError} />
        <div className="mt-4">
          <PrimaryButton variant="outline" onClick={() => void finish({ approved: false })}>
            Close
          </PrimaryButton>
        </div>
      </FlowScreen>
    )
  }
  if (!request)
    return (
      <FlowScreen className="justify-center items-center">
        <div className="text-sm text-muted-foreground">Loading request…</div>
      </FlowScreen>
    )

  const host = (() => {
    try {
      return new URL(request.origin).host
    } catch {
      return request.origin
    }
  })()
  const insecure =
    request.origin.startsWith('http://') &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(request.origin)

  const titles: Record<
    ApprovalRequest['kind'],
    { title: string; icon: React.ReactNode; confirm: string }
  > = {
    connect: {
      title: 'Connect to this site?',
      icon: <Link2 className="h-5 w-5" />,
      confirm: 'Connect',
    },
    unlock: {
      title: 'Unlock to continue',
      icon: <Shield className="h-5 w-5" />,
      confirm: 'Continue',
    },
    'personal-sign': {
      title: 'Signature request',
      icon: <FileSignature className="h-5 w-5" />,
      confirm: 'Sign',
    },
    'typed-sign': {
      title: 'Signature request',
      icon: <FileSignature className="h-5 w-5" />,
      confirm: 'Sign',
    },
    'pq-sign': {
      title: 'Post-quantum signature',
      icon: <Shield className="h-5 w-5" />,
      confirm: 'Sign',
    },
    transaction: {
      title: 'Confirm transaction',
      icon: <Send className="h-5 w-5" />,
      confirm: 'Confirm',
    },
    exchange: {
      title: 'Confirm exchange operation',
      icon: <Repeat className="h-5 w-5" />,
      confirm: 'Confirm',
    },
    'switch-chain': {
      title: 'Switch network?',
      icon: <Network className="h-5 w-5" />,
      confirm: 'Switch',
    },
    'watch-asset': {
      title: 'Add token?',
      icon: <Coins className="h-5 w-5" />,
      confirm: 'Add token',
    },
  }
  const t = titles[request.kind]

  return (
    <FlowScreen>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          {t.icon}
        </div>
        <div>
          <h1 className="text-base font-bold">{t.title}</h1>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Globe className="h-3 w-3" /> {host}
          </div>
        </div>
      </div>

      {insecure && (
        <Notice tone="warning" icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}>
          This site is not using HTTPS. Anyone on your network could alter what it asks you to sign.
        </Notice>
      )}

      <div className="space-y-3 mt-3 flex-1">
        {request.kind === 'connect' && (
          <>
            {remote && (
              <Notice tone="warning" icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}>
                Connecting through a scanned code. Approve only if you scanned it just now, from a screen you are using
                yourself.
              </Notice>
            )}
            <p className="text-xs text-muted-foreground">
              The site will see the selected addresses and your balances, and can{' '}
              <strong>ask</strong> you to sign or send. It cannot move funds without your approval.
            </p>
            <div className="rounded-xl glass p-1.5">
              {w.allWallets.map((a) => (
                <label
                  key={a.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/30"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(a.id)}
                    onChange={(e) => {
                      const n = new Set(selected)
                      if (e.target.checked) n.add(a.id)
                      else n.delete(a.id)
                      setPicked(n)
                    }}
                  />
                  <span className="text-sm flex-1">{a.name}</span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {shortenAddress(a.ethAddress, 4)}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        {request.kind === 'unlock' && (
          <p className="text-xs text-muted-foreground">
            {host} is waiting for your wallet. Unlock to review its request.
          </p>
        )}

        {(request.kind === 'personal-sign' || request.kind === 'pq-sign') &&
          (() => {
            const m =
              request.kind === 'personal-sign'
                ? humanMessage(request.message, request.encoding)
                : { text: request.message, binary: false }
            return (
              <>
                {account && (
                  <Field label="Account">
                    {account.name} ·{' '}
                    {shortenAddress(
                      request.kind === 'pq-sign' ? account.pqAddress : account.ethAddress,
                      5
                    )}
                  </Field>
                )}
                {m.binary && (
                  <Notice
                    tone="warning"
                    icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
                  >
                    This is unreadable data, not a message. Sign only if you fully trust this site.
                  </Notice>
                )}
                <pre
                  className="rounded-xl bg-muted/40 p-3 text-[11px] whitespace-pre-wrap break-all max-h-64 overflow-y-auto"
                  data-selectable
                >
                  {m.text}
                </pre>
                {request.kind === 'pq-sign' && (
                  <p className="text-[10px] text-muted-foreground">
                    Signed with your ML-DSA-65 key using the QRDX message prefix — it cannot be
                    replayed as a transaction.
                  </p>
                )}
              </>
            )
          })()}

        {request.kind === 'typed-sign' &&
          (() => {
            const td = request.typedData as {
              domain?: Record<string, unknown>
              primaryType?: string
              message?: unknown
            }
            return (
              <>
                {account && <Field label="Account">{account.name}</Field>}
                <Field label="Type">{td.primaryType}</Field>
                {td.domain?.name !== undefined && (
                  <Field label="App">{String(td.domain.name)}</Field>
                )}
                {td.domain?.verifyingContract !== undefined && (
                  <Field label="Contract">{String(td.domain.verifyingContract)}</Field>
                )}
                <pre
                  className="rounded-xl bg-muted/40 p-3 text-[11px] whitespace-pre-wrap break-all max-h-64 overflow-y-auto"
                  data-selectable
                >
                  {JSON.stringify(td.message, null, 2)}
                </pre>
              </>
            )
          })()}

        {request.kind === 'transaction' &&
          (() => {
            const chain = getChain(request.chain)
            const sym = chain?.nativeCurrency.symbol ?? 'QRDX'
            const dec = chain?.nativeCurrency.decimals ?? 18
            const decoded = decodeCalldata(request.tx.data)
            return (
              <div className="rounded-xl glass p-3">
                <Field label="From">
                  {account?.name} · {request.credential === 'pq' ? 'quantum-safe' : 'classic'}
                </Field>
                <Field label="To">
                  {request.tx.to ? shortenAddress(request.tx.to, 6) : 'New contract'}
                </Field>
                {request.tx.toAccountId && (
                  <Field label="Ledger account">{shortenAddress(request.tx.toAccountId, 6)}</Field>
                )}
                <Field label="Amount">
                  {weiToEth(BigInt(request.tx.value), dec)} {sym}
                </Field>
                <Field label="Network fee (max)">
                  {weiToEth(BigInt(request.tx.fee), dec)} {sym}
                </Field>
                <Field label="Network">{chain?.name}</Field>
                {decoded && <Field label={decoded.label}>{decoded.detail}</Field>}
                {decoded?.warning && (
                  <div className="mt-2">
                    <Notice
                      tone="warning"
                      icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
                    >
                      {decoded.warning}
                    </Notice>
                  </div>
                )}
              </div>
            )
          })()}

        {request.kind === 'exchange' && (
          <div className="space-y-2">
            {request.summary && (
              <div className="rounded-xl glass p-3">
                <p className="text-sm font-semibold leading-snug">{request.summary.headline}</p>
                {request.summary.details.length > 0 && (
                  <div className="mt-2">
                    {request.summary.details.map((d) => (
                      <Field key={d.label} label={d.label}>
                        {d.value}
                      </Field>
                    ))}
                  </div>
                )}
              </div>
            )}
            {request.summary?.warnings.map((w) => (
              <Notice key={w} tone="warning" icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}>
                {w}
              </Notice>
            ))}
            <details className="rounded-xl glass p-3" open={!request.summary}>
              <summary className="cursor-pointer text-xs text-muted-foreground">
                {request.op.replace(/_/g, ' ').toLowerCase()} · raw parameters
              </summary>
              <div className="mt-2">
                {Object.entries(request.params).map(([k, v]) => (
                  <Field key={k} label={k}>
                    <span className="break-all">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                  </Field>
                ))}
              </div>
            </details>
            <div className="rounded-xl glass p-3">
              <Field label="Signed by">{account ? shortenAddress(account.pqAddress, 5) : ''}</Field>
              <p className="text-[10px] text-muted-foreground mt-2">
                A small QRDX fee is burned whether or not the operation succeeds. It executes when the
                next block includes it.
              </p>
            </div>
          </div>
        )}

        {request.kind === 'switch-chain' && (
          <div className="flex items-center justify-center gap-3 py-4 text-sm font-semibold">
            <span>{w.activeChain.name}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span>{getChain(request.chain)?.name}</span>
          </div>
        )}

        {request.kind === 'watch-asset' && (
          <div className="rounded-xl glass p-3">
            <Field label="Symbol">{request.token.symbol}</Field>
            <Field label="Address">{request.token.address}</Field>
            <Field label="Decimals">{request.token.decimals}</Field>
            <Field label="Network">{getChain(request.chain)?.name}</Field>
            <p className="text-[10px] text-muted-foreground mt-2">
              Anyone can create a token with any name. Check the address before trusting it.
            </p>
          </div>
        )}
      </div>

      {request.kind !== 'unlock' && (
        <div className="grid grid-cols-2 gap-2 pt-4">
          <PrimaryButton variant="outline" disabled={busy} onClick={() => respond(false)}>
            Reject
          </PrimaryButton>
          <PrimaryButton
            loading={busy}
            disabled={request.kind === 'connect' && selected.size === 0}
            onClick={() => respond(true)}
          >
            <Check className="h-4 w-4 mr-1" /> {t.confirm}
          </PrimaryButton>
        </div>
      )}
    </FlowScreen>
  )
}
