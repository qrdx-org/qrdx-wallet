'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  AlertTriangle,
  Loader2,
  Search,
  Fuel,
  Wallet,
  Send,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { validateAddress, addressesEqual, shortenAddress } from '@/src/core/address'

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
}

// Gradient colors for known tokens
const TOKEN_COLORS: Record<string, string> = {
  QRDX: 'from-primary to-primary/60',
  ETH: 'from-blue-500 to-blue-600',
  USDC: 'from-blue-400 to-cyan-500',
  BTC: 'from-orange-400 to-amber-500',
  DAI: 'from-yellow-400 to-amber-500',
  LINK: 'from-blue-600 to-indigo-600',
  UNI: 'from-pink-400 to-pink-600',
  MATIC: 'from-purple-500 to-violet-600',
  BNB: 'from-yellow-500 to-yellow-600',
  AVAX: 'from-red-500 to-red-600',
}

type Step = 'select-token' | 'send-form'
type TxStatus = 'idle' | 'estimating' | 'sending' | 'success' | 'error'

export function SendModal({ ethAddress, pqAddress, onClose }: SendModalProps) {
  const {
    balances,
    activeChain,
    estimateGas,
    sendTransaction,
    sendTokenTransaction,
    addressBook,
    networkStatus,
  } = useWallet()

  const [step, setStep] = useState<Step>('select-token')
  const [search, setSearch] = useState('')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [selectedToken, setSelectedToken] = useState<TokenOption | null>(null)
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txError, setTxError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [addressType, setAddressType] = useState<'eth' | 'pq'>('eth')
  const [gasEstimate, setGasEstimate] = useState<string | null>(null)

  const fromAddress = addressType === 'eth' ? ethAddress : pqAddress

  // Helper to format wei to readable ETH
  const formatWeiToEth = (wei: bigint): string => {
    const divisor = 10n ** 18n
    const whole = wei / divisor
    const remainder = wei % divisor
    const fracStr = remainder.toString().padStart(18, '0').slice(0, 6)
    return `${whole}.${fracStr}`
  }

  // Build token list from real balances
  const tokenOptions: TokenOption[] = useMemo(() => {
    if (balances.length === 0) {
      // If no balances loaded yet, show native token with 0 balance
      const nativeSym = activeChain.nativeCurrency?.symbol ?? 'ETH'
      return [{
        symbol: nativeSym,
        name: activeChain.nativeCurrency?.name ?? 'Ether',
        balance: '0.0000',
        balanceNum: 0,
        value: '$0.00',
        color: TOKEN_COLORS[nativeSym] ?? 'from-gray-500 to-gray-600',
        icon: nativeSym.slice(0, 2),
        decimals: activeChain.nativeCurrency?.decimals ?? 18,
      }]
    }

    return balances.map((b) => {
      const bal = parseFloat(b.formattedBalance)
      return {
        symbol: b.symbol,
        name: b.name ?? b.symbol,
        balance: bal.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
        balanceNum: bal,
        value: '', // Price oracle not yet connected
        color: TOKEN_COLORS[b.symbol] ?? 'from-gray-500 to-gray-600',
        icon: b.symbol.slice(0, 2),
        contractAddress: b.address, // TokenBalance uses 'address' for contract
        decimals: b.decimals ?? 18,
      }
    })
  }, [balances, activeChain])

  const filteredTokens = useMemo(() => {
    if (!search.trim()) return tokenOptions
    const q = search.toLowerCase()
    return tokenOptions.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q)
    )
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
  //
  // Sending to a wrong address is irreversible, so this gates the Send button
  // rather than only informing gas estimation. Three distinct rejections
  // matter here:
  //
  //  • Malformed / bad checksum — caught by validateAddress. A mixed-case
  //    address whose EIP-55 checksum fails is a transcription error, which is
  //    exactly what the checksum exists to detect.
  //  • A post-quantum (0xPQ) recipient — the EVM `to` field is 20 bytes and a
  //    PQ address is 32, so such a transaction cannot be encoded at all. It
  //    must be refused with an explanation, not silently truncated.
  //  • Your own address — almost always a mistake, and costs a fee for nothing.
  const recipientCheck = useMemo(() => {
    const raw = recipient.trim()
    if (raw === '') return { state: 'empty' as const }

    const result = validateAddress(raw)
    if (!result.valid) {
      return { state: 'invalid' as const, message: result.error ?? 'Invalid address' }
    }

    if (result.kind === 'pq') {
      return {
        state: 'invalid' as const,
        message:
          'Post-quantum (0xPQ) addresses cannot receive EVM transactions — ' +
          'they are 32 bytes and the transaction recipient field holds 20.',
      }
    }

    if (addressesEqual(result.normalized!, fromAddress)) {
      return { state: 'invalid' as const, message: 'That is this account\u2019s own address' }
    }

    const contact = addressBook.find(c => addressesEqual(c.address, result.normalized!))
    return {
      state: 'valid' as const,
      address: result.normalized!,
      contactName: contact?.name,
    }
  }, [recipient, fromAddress, addressBook])

  const recipientIsValid = recipientCheck.state === 'valid'

  // ── Amount validation ───────────────────────────────────────────────────
  const amountCheck = useMemo(() => {
    const raw = amount.replace(/,/g, '').trim()
    if (raw === '') return { state: 'empty' as const }

    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) {
      return { state: 'invalid' as const, message: 'Enter an amount greater than zero' }
    }
    if (selectedToken && value > selectedToken.balanceNum) {
      return {
        state: 'invalid' as const,
        message: `Exceeds your balance of ${selectedToken.balance} ${selectedToken.symbol}`,
      }
    }
    return { state: 'valid' as const, value }
  }, [amount, selectedToken])

  // The wallet refuses to sign unless the node's chain id verified, so surface
  // that here instead of letting the user fill in a form that cannot be sent.
  const networkBlocked =
    networkStatus.state === 'mismatch' || networkStatus.state === 'unreachable'

  const canSend =
    recipientIsValid &&
    amountCheck.state === 'valid' &&
    !networkBlocked &&
    txStatus !== 'sending' &&
    txStatus !== 'estimating'

  // Estimate gas whenever recipient and amount change
  useEffect(() => {
    if (!recipient || !amount || !selectedToken) {
      setGasEstimate(null)
      return
    }

    const amountNum = parseFloat(amount.replace(/,/g, ''))
    if (isNaN(amountNum) || amountNum <= 0) {
      setGasEstimate(null)
      return
    }

    if (!recipientIsValid) {
      setGasEstimate(null)
      return
    }

    let cancelled = false
    setTxStatus('estimating')

    estimateGas(recipient, amount.replace(/,/g, ''))
      .then((est) => {
        if (!cancelled) {
          setGasEstimate(formatWeiToEth(est.estimatedCostWei))
          setTxStatus('idle')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGasEstimate(null)
          setTxStatus('idle')
        }
      })

    return () => { cancelled = true }
  }, [recipient, amount, selectedToken?.symbol, recipientIsValid]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    // Re-check rather than trusting the button's disabled state: this is the
    // last point before an irreversible transfer.
    if (!canSend || !selectedToken || recipientCheck.state !== 'valid') return
    setTxError(null)
    setTxHash(null)
    setTxStatus('sending')

    try {
      const cleanAmount = amount.replace(/,/g, '')

      let result: { hash: string }
      if (selectedToken.contractAddress) {
        // ERC-20 token transfer: sign + broadcast
        result = await sendTokenTransaction(
          selectedToken.contractAddress,
          recipientCheck.address,
          cleanAmount,
          selectedToken.decimals
        )
      } else {
        // Native currency transfer: sign + broadcast
        result = await sendTransaction(recipientCheck.address, cleanAmount)
      }

      setTxHash(result.hash)
      setTxStatus('success')
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Transaction failed')
      setTxStatus('error')
    }
  }

  const handleMax = () => {
    if (selectedToken) {
      setAmount(selectedToken.balance.replace(/,/g, ''))
    }
  }

  /* ─── Step 1: Token Selection ─── */
  if (step === 'select-token') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
        {/* Header */}
        <div className="glass-strong sticky top-0 z-20">
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
                key={token.symbol}
                onClick={() => handleSelectToken(token)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-accent/30 active:bg-accent/50 transition-all group text-left"
              >
                {/* Token icon */}
                <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${token.color} flex items-center justify-center shadow-lg shadow-black/10 group-hover:scale-105 transition-transform`}>
                  <span className="text-white text-sm font-bold">{token.icon}</span>
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
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">{token.value}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">balance</div>
                </div>

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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      {/* Header */}
      <div className="glass-strong sticky top-0 z-20">
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
                <span className="text-white text-xs font-bold">{token.icon}</span>
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
                <div className="text-lg font-bold mt-0.5">{token.balance} <span className="text-sm text-muted-foreground font-medium">{token.symbol}</span></div>
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
                onClick={() => setAddressType('eth')}
                className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded-md transition-all ${
                  addressType === 'eth'
                    ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                    : 'bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground/70'
                }`}
              >
                ETH
              </button>
              <button
                onClick={() => setAddressType('pq')}
                className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded-md transition-all ${
                  addressType === 'pq'
                    ? 'bg-primary/20 text-primary ring-1 ring-primary/30'
                    : 'bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground/70'
                }`}
              >
                PQ
              </button>
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
              placeholder="0x… recipient address"
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
                    .filter((c) => c.addressType === 'eth')
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
                  <span className="text-white text-[8px] font-bold">{token.icon}</span>
                </div>
                <span className="text-sm font-semibold text-muted-foreground">{token.symbol}</span>
              </div>
            </div>
            <div className="flex justify-between items-center mt-1.5 px-0.5">
              <span className="text-[10px] text-muted-foreground">
                Balance: {token.balance} {token.symbol}
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

        {/* Warning for PQ */}
        {addressType === 'pq' && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span className="text-[10px] text-amber-400/90 leading-relaxed">
              Sending via post-quantum address uses Dilithium signatures. Ensure the recipient supports PQ transactions.
            </span>
          </div>
        )}

        {/* Error message */}
        {txError && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
            <span className="text-[10px] text-red-400/90">{txError}</span>
          </div>
        )}

        {/* Success message */}
        {txStatus === 'success' && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
            <div className="text-[10px] text-green-400/90">
              <p>Transaction sent successfully!</p>
              {txHash && (
                <a
                  href={`${activeChain.explorerUrl}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-300 underline break-all mt-1 block"
                >
                  {txHash.slice(0, 16)}...{txHash.slice(-8)}
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sticky send button */}
      <div className="sticky bottom-0 p-4 glass-strong space-y-2">
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
