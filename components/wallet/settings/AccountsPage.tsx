'use client'

/**
 * Accounts: everything about which keys this wallet holds.
 *
 * Accounts are grouped by where their keys come from — a recovery phrase
 * (many accounts, one backup) or an imported key (one account each). Adding
 * an account derives the next one from the existing phrase; only an explicit
 * import brings in new key material. Every export asks for the password again.
 */

import { useState } from 'react'
import {
  Check,
  ChevronRight,
  Eye,
  FileJson,
  Key,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  UserPlus,
} from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { getEvmProvider } from '@/src/core/ethereum'
import { isQrdxChain } from '@/src/core/chains'
import { shortenAddress } from '@/src/core/address'
import type { WalletAccount } from '@/src/core/types'
import {
  ChoiceButton,
  CopyButton,
  ErrorBanner,
  KeystorePicker,
  Notice,
  NewPasswordFields,
  PasswordField,
  PhraseGrid,
  PhraseInput,
  PrimaryButton,
  PrivateKeyInput,
  Sheet,
  TextField,
  newPasswordValid,
  phraseInputValid,
  privateKeyValid,
} from '../flow/FlowKit'
import { PasswordSheet, Row, Section, SettingsPage, saveFile } from './shared'

type Dialog =
  | null
  | { kind: 'add' }
  | { kind: 'add-derived' }
  | { kind: 'import'; method: 'phrase' | 'key' | 'keystore' }
  | { kind: 'discover'; keyringId: string }
  | { kind: 'rename'; account: WalletAccount }
  | { kind: 'show-phrase'; keyringId: string }
  | { kind: 'export-keys'; account: WalletAccount }
  | { kind: 'export-keystore'; account: WalletAccount }
  | { kind: 'remove'; account: WalletAccount }

export function AccountsPage({ onBack }: { onBack: () => void }) {
  const w = useWallet()
  const [dialog, setDialog] = useState<Dialog>(null)
  const close = () => setDialog(null)
  const keyrings = w.state?.keyrings ?? []
  const hasPhrase = keyrings.some((k) => k.type === 'hd')

  return (
    <SettingsPage title="Accounts" onBack={onBack}>
      {keyrings
        .filter((k) => k.type === 'hd' && !k.backedUp)
        .map((k) => (
          <Notice
            key={k.id}
            tone="warning"
            icon={<ShieldAlert className="h-4 w-4 text-amber-500" />}
          >
            <strong className="text-foreground">{k.label} is not backed up.</strong>{' '}
            <button
              type="button"
              className="text-primary font-medium"
              onClick={() => setDialog({ kind: 'show-phrase', keyringId: k.id })}
            >
              Back it up now
            </button>
          </Notice>
        ))}

      {keyrings.map((k) => {
        const accounts = w.allWallets.filter((a) => a.keyringId === k.id)
        return (
          <Section
            key={k.id}
            title={k.type === 'hd' ? k.label : 'Imported'}
            action={
              k.type === 'hd' ? (
                <button
                  type="button"
                  onClick={() => setDialog({ kind: 'discover', keyringId: k.id })}
                  className="text-[11px] text-primary font-medium inline-flex items-center gap-1"
                >
                  <Search className="h-3 w-3" /> Find accounts
                </button>
              ) : undefined
            }
          >
            {accounts.map((a) => {
              const active = a.id === w.currentWallet?.id
              return (
                <div key={a.id} className={`rounded-xl p-3 ${active ? 'bg-primary/10' : ''}`}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => w.switchWallet(a.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate">{a.name}</span>
                        {active && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                        {a.source === 'imported-key' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">
                            classical PQ
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label="Rename"
                      onClick={() => setDialog({ kind: 'rename', account: a })}
                      className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="mt-1.5 space-y-1 text-[11px] font-mono text-muted-foreground">
                    <div className="flex items-center justify-between gap-2">
                      <span>0x · {shortenAddress(a.ethAddress, 6)}</span>
                      <CopyButton text={a.ethAddress} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>PQ · {shortenAddress(a.pqAddress, 6)}</span>
                      <CopyButton text={a.pqAddress} />
                    </div>
                  </div>
                  {active && (
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: 'export-keys', account: a })}
                        className="text-[11px] rounded-lg bg-accent/30 py-1.5 hover:bg-accent/50"
                      >
                        Private keys
                      </button>
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: 'export-keystore', account: a })}
                        className="text-[11px] rounded-lg bg-accent/30 py-1.5 hover:bg-accent/50"
                      >
                        Keystore
                      </button>
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: 'remove', account: a })}
                        disabled={w.allWallets.length < 2}
                        className="text-[11px] rounded-lg bg-red-500/10 text-red-500 py-1.5 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {k.type === 'hd' && (
              <Row
                icon={<Eye className="h-4 w-4" />}
                label="Show recovery phrase"
                description="Requires your password"
                onClick={() => setDialog({ kind: 'show-phrase', keyringId: k.id })}
                right={<ChevronRight className="h-4 w-4 text-muted-foreground" />}
              />
            )}
          </Section>
        )
      })}

      <PrimaryButton onClick={() => setDialog({ kind: 'add' })}>
        <Plus className="h-5 w-5 mr-2" /> Add account
      </PrimaryButton>

      {dialog?.kind === 'add' && (
        <Sheet title="Add account" onClose={close}>
          <div className="space-y-2.5">
            {hasPhrase && (
              <ChoiceButton
                icon={<UserPlus className="h-5 w-5 text-primary" />}
                title="New account"
                description="Next account from your recovery phrase — no new backup needed"
                onClick={() => setDialog({ kind: 'add-derived' })}
              />
            )}
            <ChoiceButton
              icon={<KeyRound className="h-5 w-5 text-primary" />}
              title="Import recovery phrase"
              description="Another wallet’s 12 or 24 words"
              onClick={() => setDialog({ kind: 'import', method: 'phrase' })}
            />
            <ChoiceButton
              icon={<Key className="h-5 w-5 text-primary" />}
              title="Import private key"
              description="A single account"
              onClick={() => setDialog({ kind: 'import', method: 'key' })}
            />
            <ChoiceButton
              icon={<FileJson className="h-5 w-5 text-primary" />}
              title="Import keystore file"
              description="Encrypted JSON (V3)"
              onClick={() => setDialog({ kind: 'import', method: 'keystore' })}
            />
          </div>
        </Sheet>
      )}
      {dialog?.kind === 'add-derived' && <AddDerivedSheet onClose={close} />}
      {dialog?.kind === 'import' && <ImportSheet method={dialog.method} onClose={close} />}
      {dialog?.kind === 'discover' && (
        <DiscoverSheet keyringId={dialog.keyringId} onClose={close} />
      )}
      {dialog?.kind === 'rename' && <RenameSheet account={dialog.account} onClose={close} />}
      {dialog?.kind === 'show-phrase' && (
        <ShowPhraseSheet keyringId={dialog.keyringId} onClose={close} />
      )}
      {dialog?.kind === 'export-keys' && (
        <ExportKeysSheet account={dialog.account} onClose={close} />
      )}
      {dialog?.kind === 'export-keystore' && (
        <ExportKeystoreSheet account={dialog.account} onClose={close} />
      )}
      {dialog?.kind === 'remove' && (
        <PasswordSheet
          title={`Remove ${dialog.account.name}?`}
          danger
          confirmLabel="Remove account"
          description="It disappears from this device. You can restore it later from its recovery phrase or key — make sure you have them."
          onSubmit={async (pw) => {
            await w.removeWallet(dialog.account.id, pw)
            close()
          }}
          onClose={close}
        />
      )}
    </SettingsPage>
  )
}

function useAction(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, setError }
}

function AddDerivedSheet({ onClose }: { onClose: () => void }) {
  const w = useWallet()
  const [name, setName] = useState(`Account ${w.allWallets.length + 1}`)
  const { busy, error, run } = useAction(onClose)
  return (
    <Sheet title="New account" onClose={onClose}>
      <div className="space-y-3">
        <TextField label="Name" value={name} onChange={setName} autoFocus maxLength={40} />
        <ErrorBanner error={error} />
        <PrimaryButton loading={busy} onClick={() => run(() => w.addAccount(name))}>
          Create account
        </PrimaryButton>
      </div>
    </Sheet>
  )
}

function ImportSheet({
  method,
  onClose,
}: {
  method: 'phrase' | 'key' | 'keystore'
  onClose: () => void
}) {
  const w = useWallet()
  const [name, setName] = useState('')
  const [phrase, setPhrase] = useState('')
  const [key, setKey] = useState('')
  const [ks, setKs] = useState<unknown>(null)
  const [ksName, setKsName] = useState('')
  const [ksPassword, setKsPassword] = useState('')
  const { busy, error, run, setError } = useAction(onClose)
  const ready =
    method === 'phrase'
      ? phraseInputValid(phrase)
      : method === 'key'
        ? privateKeyValid(key)
        : ks !== null && !!ksPassword
  const title = {
    phrase: 'Import recovery phrase',
    key: 'Import private key',
    keystore: 'Import keystore',
  }[method]
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-3">
        {method === 'phrase' && <PhraseInput value={phrase} onChange={setPhrase} />}
        {method === 'key' && <PrivateKeyInput value={key} onChange={setKey} />}
        {method === 'keystore' && (
          <>
            <KeystorePicker
              fileName={ksName}
              onLoaded={(j, n) => {
                setKs(j)
                setKsName(n)
                setError(null)
              }}
              onError={setError}
            />
            <PasswordField
              label="Keystore password"
              value={ksPassword}
              onChange={setKsPassword}
              autoComplete="off"
            />
          </>
        )}
        <TextField label="Account name (optional)" value={name} onChange={setName} maxLength={40} />
        <ErrorBanner error={error} />
        <PrimaryButton
          loading={busy}
          disabled={!ready}
          onClick={() =>
            run(() =>
              method === 'phrase'
                ? w.importMnemonic(phrase, name || undefined)
                : method === 'key'
                  ? w.importPrivateKey(key, name || undefined)
                  : w.importKeystore(ks, ksPassword, name || undefined)
            )
          }
        >
          Import
        </PrimaryButton>
      </div>
    </Sheet>
  )
}

/** Scan HD indices for accounts that have been used on the active chain. */
function DiscoverSheet({ keyringId, onClose }: { keyringId: string; onClose: () => void }) {
  const w = useWallet()
  const [rows, setRows] = useState<
    { index: number; ethAddress: string; pqAddress: string; balance: bigint; present: boolean }[]
  >([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [scanning, setScanning] = useState(false)
  const { busy, error, run, setError } = useAction(onClose)

  const scan = async (start: number) => {
    setScanning(true)
    setError(null)
    try {
      const provider = getEvmProvider(w.activeChain.id)
      const preview = await w.backend.previewHdAccounts(keyringId, start, 10)
      const withBalances = await Promise.all(
        preview.map(async (p) => {
          const [classic, pq, nonce] = await Promise.all([
            provider.getBalance(p.ethAddress).catch(() => 0n),
            isQrdxChain(w.activeChain)
              ? provider.getBalance(p.pqAccountId).catch(() => 0n)
              : Promise.resolve(0n),
            provider.getTransactionCount(p.ethAddress).catch(() => 0n),
          ])
          const present = w.allWallets.some(
            (a) => a.keyringId === keyringId && a.hdIndex === p.index
          )
          return {
            index: p.index,
            ethAddress: p.ethAddress,
            pqAddress: p.pqAddress,
            balance: classic + pq + (nonce > 0n ? 1n : 0n),
            present,
          }
        })
      )
      setRows((r) => [...r, ...withBalances])
      setPicked(
        (s) =>
          new Set([
            ...s,
            ...withBalances.filter((x) => x.balance > 0n && !x.present).map((x) => x.index),
          ])
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the network')
    } finally {
      setScanning(false)
    }
  }

  return (
    <Sheet title="Find accounts" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Checks the next accounts of this recovery phrase for activity on {w.activeChain.name}.
          Used ones are pre-selected.
        </p>
        {rows.length === 0 ? (
          <PrimaryButton loading={scanning} onClick={() => scan(0)}>
            <Search className="h-4 w-4 mr-2" /> Scan
          </PrimaryButton>
        ) : (
          <>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {rows.map((r) => (
                <label
                  key={r.index}
                  className={`flex items-center gap-2 rounded-lg p-2 ${r.present ? 'opacity-50' : 'hover:bg-accent/30'}`}
                >
                  <input
                    type="checkbox"
                    disabled={r.present}
                    checked={r.present || picked.has(r.index)}
                    onChange={(e) =>
                      setPicked((s) => {
                        const n = new Set(s)
                        if (e.target.checked) n.add(r.index)
                        else n.delete(r.index)
                        return n
                      })
                    }
                  />
                  <span className="text-[11px] w-6 text-muted-foreground">#{r.index + 1}</span>
                  <span className="text-[11px] font-mono flex-1">
                    {shortenAddress(r.ethAddress, 5)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {r.present ? 'added' : r.balance > 0n ? 'used' : 'empty'}
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={scanning}
              onClick={() => scan(rows.length)}
              className="text-xs text-primary font-medium"
            >
              {scanning ? 'Scanning…' : 'Scan 10 more'}
            </button>
            <ErrorBanner error={error} />
            <PrimaryButton
              loading={busy}
              disabled={picked.size === 0}
              onClick={() =>
                run(() => w.backend.addHdAccountsAt(keyringId, [...picked]).then(w.refreshState))
              }
            >
              Add {picked.size} account{picked.size === 1 ? '' : 's'}
            </PrimaryButton>
          </>
        )}
      </div>
    </Sheet>
  )
}

function RenameSheet({ account, onClose }: { account: WalletAccount; onClose: () => void }) {
  const w = useWallet()
  const [name, setName] = useState(account.name)
  const { busy, error, run } = useAction(onClose)
  return (
    <Sheet title="Rename account" onClose={onClose}>
      <div className="space-y-3">
        <TextField label="Name" value={name} onChange={setName} autoFocus maxLength={40} />
        <ErrorBanner error={error} />
        <PrimaryButton
          loading={busy}
          disabled={!name.trim()}
          onClick={() => run(() => w.renameAccount(account.id, name))}
        >
          Save
        </PrimaryButton>
      </div>
    </Sheet>
  )
}

function ShowPhraseSheet({ keyringId, onClose }: { keyringId: string; onClose: () => void }) {
  const w = useWallet()
  const [phrase, setPhrase] = useState<string | null>(null)
  if (!phrase) {
    return (
      <PasswordSheet
        title="Show recovery phrase"
        description="Anyone who sees these words can take every account they protect. Make sure no one is watching your screen."
        confirmLabel="Reveal"
        onSubmit={async (pw) => {
          setPhrase(await w.exportMnemonic(pw, keyringId))
          await w.backend.markBackedUp(keyringId)
          await w.refreshState()
        }}
        onClose={onClose}
      />
    )
  }
  return (
    <Sheet title="Recovery phrase" onClose={onClose}>
      <div className="space-y-3">
        <PhraseGrid words={phrase.split(' ')} revealed />
        <div className="flex justify-end">
          <CopyButton text={phrase} secret />
        </div>
        <PrimaryButton onClick={onClose}>Done</PrimaryButton>
      </div>
    </Sheet>
  )
}

function ExportKeysSheet({ account, onClose }: { account: WalletAccount; onClose: () => void }) {
  const w = useWallet()
  const [keys, setKeys] = useState<{ ethPrivateKey: string; pqSeed: string } | null>(null)
  if (!keys) {
    return (
      <PasswordSheet
        title="Export private keys"
        description={
          <>Never share these. A site or person asking for them is trying to steal your funds.</>
        }
        confirmLabel="Show keys"
        onSubmit={async (pw) => setKeys(await w.exportPrivateKey(pw, account.id))}
        onClose={onClose}
      />
    )
  }
  return (
    <Sheet title={`${account.name} — private keys`} onClose={onClose}>
      <div className="space-y-3">
        {[
          {
            label: 'Classic (secp256k1) private key',
            value: '0x' + keys.ethPrivateKey,
            hint: 'Works in MetaMask and other Ethereum wallets.',
          },
          {
            label: 'Post-quantum (ML-DSA-65) seed',
            value: keys.pqSeed,
            hint: 'Restores the 0xPQ account. Only QRDX wallets understand it.',
          },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-border/60 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold">{k.label}</span>
              <CopyButton text={k.value} secret />
            </div>
            <div className="font-mono text-[11px] break-all bg-muted/40 rounded-lg p-2">
              {k.value}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{k.hint}</p>
          </div>
        ))}
        <PrimaryButton onClick={onClose}>Done</PrimaryButton>
      </div>
    </Sheet>
  )
}

function ExportKeystoreSheet({
  account,
  onClose,
}: {
  account: WalletAccount
  onClose: () => void
}) {
  const w = useWallet()
  const [ksPassword, setKsPassword] = useState('')
  const [ksConfirm, setKsConfirm] = useState('')
  return (
    <PasswordSheet
      title="Export keystore"
      description="A standard V3 keystore file. MetaMask and geth import the classic key from it; QRDX Wallet also restores the post-quantum account. Choose a password for the file."
      confirmLabel="Download keystore"
      onSubmit={async (pw) => {
        if (!newPasswordValid(ksPassword, ksConfirm))
          throw new Error('Choose a keystore password of at least 8 characters, entered twice')
        const ks = await w.exportKeystoreJSON(pw, ksPassword, account.id)
        await saveFile(`qrdx-${account.ethAddress.slice(2, 10)}.json`, JSON.stringify(ks, null, 2))
        onClose()
      }}
      onClose={onClose}
    >
      <NewPasswordFields
        password={ksPassword}
        confirm={ksConfirm}
        onPassword={setKsPassword}
        onConfirm={setKsConfirm}
        labels={{ password: 'Keystore password', confirm: 'Confirm keystore password' }}
      />
    </PasswordSheet>
  )
}
