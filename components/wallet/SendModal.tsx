'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  AlertTriangle,
  Loader2,
  Search,
  Fuel,
  Wallet,
  Send,
  Shield,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useWallet, type SendInput } from '@/src/shared/contexts/WalletContext'
import { validateAddress, addressesEqual, shortenAddress } from '@/src/core/address'
import { sameAccount } from '@/src/core/account-id'
import { resolveRecipient, type Credential, type SendQuote } from '@/src/core/tx-service'
import { ethToWei, weiToEth } from '@/src/core/ethereum'
import { defaultCredential, formatAmount, formatUnitsExact } from '@/src/core/balances'
import { isQrdxChain } from '@/src/core/chains'

interface SendModalProps {
  ethAddress: string
  pqAddress: string
  onClose: () => void
}

interface TokenOption {
  symbol: string
  name: string
  balance: string
  balanceNum: number
  value: string
  color: string
  icon: string
  /** Contract address for ERC-20, empty for native token */
  contractAddress?: string
  decimals: number
  /** Raw base-unit balance, for exact MAX. */
  raw?: bigint
}

// Gradient colors for known tokens
const TOKEN_COLORS: Record<string, string> = {
  QRDX: 'from-primary to-primary/60',
  ETH: 'from-primary to-primary/70',
  USDC: 'from-primary to-primary/70',
  BTC: 'from-primary to-primary/70',
  DAI: 'from-primary to-primary/70',
  LINK: 'from-primary to-primary/70',
  UNI: 'from-primary to-primary/70',
  MATIC: 'from-primary to-primary/70',
  BNB: 'from-primary to-primary/70',
  AVAX: 'from-red-500 to-red-600',
}

type Step = 'select-token' | 'send-form'
type TxStatus = 'idle' | 'estimating' | 'sending' | 'success' | 'error'

/**
 * Send flow. The source is one of the account's two credentials:
 *
 *   classic (0x)       — secp256k1, legacy/EIP-1559 transaction
 *   quantum-safe (PQ)  — ML-DSA-65, type-0x51 transaction (QRDX only)
 *
 * On QRDX either credential can pay any recipient form; the recipient is
 * resolved to its 20-byte ledger account before encoding, and that resolution
 * is shown so the user can see exactly where funds go. The fee shown is the
 * quote the transaction is then built with.
 */
export function SendModal({ ethAddress, pqAddress, onClose }: SendModalProps) {
  const { balances, pqBalances, activeChain, quoteSend, send, addressBook, networkStatus } = useWallet()
  const qrdx = isQrdxChain(activeChain)

  const [step, setStep] = useState<Step>('select-token')
  const [search, setSearch] = useState('')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [selectedToken, setSelectedToken] = useState<TokenOption | null>(null)
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txError, setTxError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  // Start on the address that holds funds: on QRDX that is usually the post-quantum
  // one, where exchange tokens live; until the reader picks one themselves.
  const [addressType, setAddressTypeState] = useState<Credential>(() => defaultCredential(balances, pqBalances, qrdx))
  const pickedCredential = useRef(false)
  useEffect(() => {
    if (!pickedCredential.current) setAddressTypeState(defaultCredential(balances, pqBalances, qrdx))
  }, [balances, pqBalances, qrdx])
  const [quote, setQuote] = useState<SendQuote | null>(null)

  const fromAddress = addressType === 'classic' ? ethAddress : pqAddress
  const sourceBalances = addressType === 'pq' ? pqBalances : balances
  const nativeSymbol = activeChain.nativeCurrency?.symbol ?? 'ETH'
  const nativeDecimals = activeChain.nativeCurrency?.decimals ?? 18

  const setAddressType = (t: Credential) => {
    pickedCredential.current = true
    setAddressTypeState(t)
    setQuote(null)
    // Token balances differ per credential; re-pick the same token from the new source.
    setSelectedToken(null)
    setStep('select-token')
  }

  const tokenOptions: TokenOption[] = useMemo(() => {
    if (sourceBalances.length === 0) {
      return [{
        symbol: nativeSymbol,
        name: activeChain.nativeCurrency?.name ?? 'Ether',
        balance: '0.0000',
        balanceNum: 0,
        value: '',
        color: TOKEN_COLORS[nativeSymbol] ?? 'from-primary/80 to-primary/50',
        icon: nativeSymbol.slice(0, 2),
        decimals: nativeDecimals,
      }]
    }
    // The native coin, and the tokens this address holds (every QRDX token is listed by the node).
    return sourceBalances.filter(b => b.address === '' || b.rawBalance > 0n).map(b => {
      const bal = Number(formatUnitsExact(b.rawBalance, b.decimals ?? 18))
      return {
        symbol: b.symbol,
        name: b.name ?? b.symbol,
        balance: formatAmount(b.rawBalance, b.decimals ?? 18),
        balanceNum: bal,
        value: '',
        color: TOKEN_COLORS[b.symbol] ?? 'from-primary/80 to-primary/50',
        icon: b.symbol.slice(0, 2),
        contractAddress: b.address,
        decimals: b.decimals ?? 18,
        raw: b.rawBalance,
      }
    })
  }, [sourceBalances, activeChain, nativeSymbol, nativeDecimals])

  const filteredTokens = useMemo(() => {
    if (!search.trim()) return tokenOptions
    const q = search.toLowerCase()
    return tokenOptions.filter(t => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
  }, [search, tokenOptions])

  const handleSelectToken = (token: TokenOption) => {
    setSelectedToken(token)
    setStep('send-form')
    setSearch('')
  }

  const handleBack = () => {
    if (step === 'send-form') {
      setStep('select-token')
      setAmount('')
      setTxError(null)
      setTxStatus('idle')
    } else {
      onClose()
    }
  }

  // ── Recipient validation ────────────────────────────────────────────────
  // Sending to a wrong address is irreversible, so this gates the Send button.
  const recipientCheck = useMemo(() => {
    const raw = recipient.trim()
    if (raw === '') return { state: 'empty' as const }
    const result = validateAddress(raw)
    let resolved: { accountId: string; resolved: boolean }
    try {
      resolved = resolveRecipient(activeChain, raw)
    } catch (e) {
      return { state: 'invalid' as const, message: e instanceof Error ? e.message : 'Invalid address' }
    }
    if (result.valid === false && result.kind !== null) {
      return { state: 'invalid' as const, message: result.error ?? 'Invalid address' }
    }
    if (sameAccount(raw, fromAddress)) {
      return { state: 'invalid' as const, message: 'That is this account\u2019s own address' }
    }
    const display = result.normalized ?? raw
    const contact = addressBook.find(c => addressesEqual(c.address, display))
    return {
      state: 'valid' as const,
      address: display,
      contactName: contact?.name,
      accountId: resolved.resolved ? resolved.accountId : null,
    }
  }, [recipient, fromAddress, addressBook, activeChain])

  const recipientIsValid = recipientCheck.state === 'valid'

  // ── Amount validation ───────────────────────────────────────────────────
  const amountCheck = useMemo(() => {
    const raw = amount.replace(/,/g, '').trim()
    if (raw === '') return { state: 'empty' as const }
    const value = Number(raw)
    if (!/^\d*\.?\d*$/.test(raw) || !Number.isFinite(value) || value <= 0) {
      return { state: 'invalid' as const, message: 'Enter an amount greater than zero' }
    }
    // Exact: compare base units, not floats.
    const exceeds = selectedToken
      ? selectedToken.raw !== undefined
        ? (() => { try { return ethToWei(raw, selectedToken.decimals) > selectedToken.raw! } catch { return true } })()
        : value > selectedToken.balanceNum
      : false
    if (selectedToken && exceeds) {
      return { state: 'invalid' as const, message: `Exceeds your balance of ${selectedToken.balance} ${selectedToken.symbol}` }
    }
    return { state: 'valid' as const, value }
  }, [amount, selectedToken])

  // The wallet refuses to sign unless the node's chain id verified.
  const networkBlocked = networkStatus.state === 'mismatch' || networkStatus.state === 'unreachable'
  const pqSendUnavailable = addressType === 'pq' && !qrdx
  const spendableLabel: string | null = null

  const canSend =
    !pqSendUnavailable && recipientIsValid && amountCheck.state === 'valid' && !networkBlocked && quote !== null &&
    txStatus !== 'sending' && txStatus !== 'estimating'

  const sendInput = (): SendInput | null => {
    if (!selectedToken || recipientCheck.state !== 'valid') return null
    return {
      credential: addressType,
      to: recipientCheck.address,
      amount: amount.replace(/,/g, '').trim(),
      token: selectedToken.contractAddress ? { address: selectedToken.contractAddress, decimals: selectedToken.decimals, symbol: selectedToken.symbol } : undefined,
    }
  }

  // Quote whenever the inputs settle.
  useEffect(() => {
    setQuote(null)
    const input = sendInput()
    if (!input || amountCheck.state !== 'valid' || pqSendUnavailable) return
    let cancelled = false
    setTxStatus('estimating')
    const t = setTimeout(() => {
      quoteSend(input)
        .then(q => !cancelled && (setQuote(q), setTxError(null)))
        .catch(e => !cancelled && setTxError(e instanceof Error ? e.message : 'Could not estimate the fee'))
        .finally(() => !cancelled && setTxStatus('idle'))
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [recipient, amount, selectedToken?.symbol, addressType, recipientIsValid, amountCheck.state]) // eslint-disable-line react-hooks/exhaustive-deps

  const gasEstimate = quote ? Number(quote.feeFormatted).toLocaleString('en-US', { maximumFractionDigits: 6 }) : null

  const handleSend = async () => {
    const input = sendInput()
    if (!canSend || !input || !quote) return
    setTxError(null)
    setTxHash(null)
    setTxStatus('sending')
    try {
      const result = await send(input, quote)
      setTxHash(result.hash)
      setTxStatus('success')
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Transaction failed')
      setTxStatus('error')
    }
  }

  const handleMax = () => {
    if (!selectedToken) return
    if (!selectedToken.contractAddress && selectedToken.raw !== undefined) {
      // Native coin: leave room for the fee (the PQ envelope alone is ~145k gas).
      const fee = quote ? BigInt(quote.fee) : 0n
      const spendable = selectedToken.raw > fee ? selectedToken.raw - fee : 0n
      setAmount(weiToEth(spendable, selectedToken.decimals).replace(/\.?0+$/, '') || '0')
      return
    }
    // Tokens: the exact holding, not the rounded display.
    setAmount(selectedToken.raw !== undefined ? formatUnitsExact(selectedToken.raw, selectedToken.decimals) : selectedToken.balance.replace(/,/g, ''))
  }

  /* ─── Step 1: Token Selection ─── */
  if (step === 'select-token') {
    return (
      <div className="min-h-screen mono-backdrop flex flex-col">
        {/* Header */}
        <div className="glass-strong sticky top-0 z-20 pt-safe">
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg hover:bg-accent/50"
                onClick={onClose}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1">
                <h1 className="text-base font-semibold">Send</h1>
                <p className="text-[10px] text-muted-foreground">Select a token to send</p>
              </div>
            </div>
          </div>
        </div>

        {/* Which address to send from: each holds its own balances. */}
        {qrdx && (
          <div className="px-4 pt-3">
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-border/50 bg-background/60 p-1 text-xs font-medium">
              {([['pq', 'Quantum-safe', pqAddress], ['classic', 'Classic', ethAddress]] as const).map(([c, label, addr]) => (
                <button
                  key={c}
                  onClick={() => setAddressType(c)}
                  className={`rounded-lg px-2 py-1.5 transition-all ${addressType === c ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                  <span className="block font-mono text-[9px] font-normal text-muted-foreground">{addr.slice(0, 8)}…{addr.slice(-4)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-4 pt-3 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Search tokens..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full bg-background/60 border border-border/50 rounded-xl pl-9 pr-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
            />
          </div>
        </div>

        {/* Token List */}
        <div className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          {filteredTokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No tokens found</p>
              <p className="text-[10px] opacity-60">Try a different search</p>
            </div>
          ) : (
            filteredTokens.map((token) => (
              <button
                key={token.contractAddress || token.symbol}
                onClick={() => handleSelectToken(token)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-accent/30 active:bg-accent/50 transition-all group text-left"
              >
                {/* Token icon */}
                <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${token.color} flex items-center justify-center shadow-lg shadow-black/10 group-hover:scale-105 transition-transform`}>
                  <span className="text-primary-foreground text-sm font-bold">{token.icon}</span>
                </div>

                {/* Token info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">{token.symbol}</span>
                    <span className="text-[10px] text-muted-foreground">{token.name}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {token.balance} {token.symbol}
                  </div>
                </div>

                {/* Value */}
                {token.value && (
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold">{token.value}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">value</div>
                  </div>
                )}

                {/* Arrow hint */}
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary/60 transition-colors shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  /* ─── Step 2: Send Form ─── */
  const token = selectedToken!

  return (
    <div className="min-h-screen mono-backdrop flex flex-col">
      {/* Header */}
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-accent/50"
              onClick={handleBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2.5 flex-1">
              <div className={`h-7 w-7 rounded-lg bg-gradient-to-br ${token.color} flex items-center justify-center shadow-md`}>
                <span className="text-primary-foreground text-xs font-bold">{token.icon}</span>
              </div>
              <div>
                <h1 className="text-base font-semibold">Send {token.symbol}</h1>
                <p className="text-[10px] text-muted-foreground">{token.name}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-3 space-y-3 overflow-y-auto">
        {/* Selected token balance card — click to change token */}
        <button
          onClick={() => setStep('select-token')}
          className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${token.color} p-[1px] w-full text-left group cursor-pointer`}
        >
          <div className="rounded-2xl bg-background/95 backdrop-blur-sm px-4 py-3 group-hover:bg-background/90 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Available Balance</div>
                <div className="text-lg font-bold mt-0.5">{spendableLabel ?? token.balance} <span className="text-sm text-muted-foreground font-medium">{token.symbol}</span></div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-muted-foreground">{token.value}</div>
                <div className="text-[9px] text-primary font-medium mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">Tap to change</div>
              </div>
            </div>
          </div>
        </button>

        {/* From address */}
        <Card className="glass border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">From</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAddressType('classic')}
                className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded-md transition-all ${
                  addressType === 'classic'
                    ? 'bg-foreground/10 text-foreground/70 ring-1 ring-foreground/30'
                    : 'bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground/70'
                }`}
              >
                Classic
              </button>
              {qrdx && <button
                onClick={() => setAddressType('pq')}
                className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded-md transition-all ${
                  addressType === 'pq'
                    ? 'bg-primary/20 text-primary ring-1 ring-primary/30'
                    : 'bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground/70'
                }`}
              >
                Quantum-safe
              </button>}
              <span className="text-[11px] text-muted-foreground font-mono truncate ml-1">
                {fromAddress.slice(0, 10)}...{fromAddress.slice(-6)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Recipient */}
        <Card className="glass border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Send className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">To</span>
            </div>
            <input
              type="text"
              placeholder={qrdx ? '0x… or 0xPQ… address' : '0x… recipient address'}
              value={recipient}
              spellCheck={false}
              onChange={(e) => setRecipient(e.target.value)}
              className={`w-full bg-background/60 border rounded-xl px-3 py-2.5 text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 transition-all ${
                recipientCheck.state === 'invalid'
                  ? 'border-red-500/50 focus:ring-red-500/40'
                  : recipientCheck.state === 'valid'
                    ? 'border-green-500/40 focus:ring-green-500/30'
                    : 'border-border/50 focus:ring-primary/50 focus:border-primary/30'
              }`}
            />

            {recipientCheck.state === 'invalid' && (
              <p className="flex items-start gap-1.5 mt-1.5 text-[10px] text-red-400">
                <AlertCircle className="h-3 w-3 shrink-0 mt-px" />
                <span>{recipientCheck.message}</span>
              </p>
            )}

            {recipientCheck.state === 'valid' && (
              <p className="flex items-center gap-1.5 mt-1.5 text-[10px] text-green-500">
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                <span>
                  {recipientCheck.contactName
                    ? `Sending to ${recipientCheck.contactName}`
                    : 'Valid address'}
                  {recipientCheck.accountId && (
                    <span className="block text-muted-foreground font-mono">ledger account {shortenAddress(recipientCheck.accountId, 6)}</span>
                  )}
                </span>
              </p>
            )}

            {/* Saved recipients. Picking one removes an opportunity to mistype
                an address, which is the failure mode with no recovery. */}
            {addressBook.length > 0 && (
              <div className="mt-2.5">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 mb-1">
                  Address book
                </div>
                <div className="flex flex-wrap gap-1">
                  {addressBook
                    .filter((c) => qrdx || c.addressType === 'eth')
                    .slice(0, 6)
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setRecipient(c.address)}
                        className="px-2 py-1 rounded-lg bg-accent/40 hover:bg-accent/70 border border-border/50 text-[10px] transition-colors"
                        title={c.address}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground ml-1 font-mono">
                          {shortenAddress(c.address, 3)}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Amount */}
        <Card className="glass border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Amount</span>
              <button
                onClick={handleMax}
                className="text-[10px] font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-md hover:bg-primary/20 transition-colors"
              >
                MAX
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-background/60 border border-border/50 rounded-xl px-3 py-2.5 text-xl font-bold placeholder:text-muted-foreground/20 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all pr-20"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <div className={`h-5 w-5 rounded-md bg-gradient-to-br ${token.color} flex items-center justify-center`}>
                  <span className="text-primary-foreground text-[8px] font-bold">{token.icon}</span>
                </div>
                <span className="text-sm font-semibold text-muted-foreground">{token.symbol}</span>
              </div>
            </div>
            <div className="flex justify-between items-center mt-1.5 px-0.5">
              <span className="text-[10px] text-muted-foreground">
                Balance: {spendableLabel ?? token.balance} {token.symbol}
              </span>
              {/* Only shown when a unit price can actually be derived. The
                  previous form divided the holding's fiat value by its balance
                  unconditionally, so a zero balance or an unpriced token (any
                  chain without a price feed, including the local testnet)
                  rendered "≈ $NaN" next to the amount being sent. */}
              {(() => {
                if (!amount) return null
                const qty = parseFloat(amount.replace(/,/g, ''))
                const holdingUsd = parseFloat(token.value.replace(/[$,]/g, ''))
                if (!Number.isFinite(qty) || !Number.isFinite(holdingUsd)) return null
                if (!token.balanceNum) return null

                const unitPrice = holdingUsd / token.balanceNum
                if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null

                return (
                  <span className="text-[10px] text-muted-foreground">
                    ≈ ${(qty * unitPrice).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                )
              })()}
            </div>
          </CardContent>
        </Card>

        {/* Transaction details */}
        <div className="glass border border-border/50 rounded-xl px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Fuel className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Network fee</span>
            </div>
            <span className="text-[11px] font-medium">
              {txStatus === 'estimating' ? (
                <Loader2 className="h-3 w-3 animate-spin inline" />
              ) : gasEstimate ? (
                <>~{gasEstimate} {activeChain.nativeCurrency?.symbol ?? 'ETH'}</>
              ) : (
                <span className="text-muted-foreground/50">Enter amount to estimate</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Network</span>
            </div>
            <span className="text-[11px] font-medium">{activeChain.name}</span>
          </div>
        </div>

        {addressType === 'pq' && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <Shield className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span className="text-[10px] text-primary/90 leading-relaxed">
              {pqSendUnavailable
                ? `${activeChain.name} has no post-quantum layer. Switch to a QRDX network to spend this balance.`
                : 'Signed with your ML-DSA-65 key as a type-0x51 post-quantum transaction. The fee is higher than a classic send because the ~5 KB signature is priced on-chain.'}
            </span>
          </div>
        )}

        {/* Transaction outcome. Restored after an over-broad edit removed it:
            the PQ path reached the node and settled while the screen still
            showed the form, giving no confirmation and no transaction hash. */}
        {txError && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
            <span className="text-[10px] text-red-400/90 leading-relaxed break-words">
              {txError}
            </span>
          </div>
        )}

        {txStatus === 'success' && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
            <div className="text-[10px] text-green-400/90 leading-relaxed min-w-0">
              <p className="font-medium">Transaction sent successfully!</p>
              {txHash && (
                <a
                  href={`${activeChain.explorerUrl}/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline break-all"
                >
                  {txHash.slice(0, 16)}…{txHash.slice(-8)}
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sticky send button */}
      <div className="sticky bottom-0 p-4 pb-safe-4 glass-strong space-y-2">
        {amountCheck.state === 'invalid' && (
          <p className="flex items-start gap-1.5 text-[10px] text-red-400">
            <AlertCircle className="h-3 w-3 shrink-0 mt-px" />
            <span>{amountCheck.message}</span>
          </p>
        )}

        {/* The wallet will not sign against a chain whose identity did not
            verify, so say that here rather than failing at submit time. */}
        {networkBlocked && (
          <p className="flex items-start gap-1.5 text-[10px] text-amber-500">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
            <span>
              {networkStatus.state === 'mismatch'
                ? `${activeChain.name} reports chain ID ${networkStatus.liveChainId}, not ` +
                  `${networkStatus.configuredChainId}. Sending is disabled until this is resolved.`
                : `Can't reach ${activeChain.name}. Sending is disabled until the network responds.`}
            </span>
          </p>
        )}

        <Button
          onClick={handleSend}
          disabled={!canSend}
          className="w-full h-12 font-semibold text-base rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 disabled:opacity-40 disabled:shadow-none transition-all"
        >
          {txStatus === 'sending' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <ArrowUpRight className="h-5 w-5 mr-2" />
              Send {token.symbol}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
