'use client'

import { useState, useMemo } from 'react'
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
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
}

const TOKENS: TokenOption[] = [
  { symbol: 'QRDX', name: 'QRDX Ledger', balance: '1,234.56', balanceNum: 1234.56, value: '$12,345.67', color: 'from-primary to-primary/60', icon: 'QR' },
  { symbol: 'ETH', name: 'Ethereum', balance: '2.5000', balanceNum: 2.5, value: '$8,234.50', color: 'from-blue-500 to-blue-600', icon: 'Ξ' },
  { symbol: 'USDC', name: 'USD Coin', balance: '5,000.00', balanceNum: 5000, value: '$5,000.00', color: 'from-blue-400 to-cyan-500', icon: '$' },
  { symbol: 'BTC', name: 'Bitcoin', balance: '0.0500', balanceNum: 0.05, value: '$4,123.45', color: 'from-orange-400 to-amber-500', icon: '₿' },
  { symbol: 'DAI', name: 'Dai Stablecoin', balance: '250.00', balanceNum: 250, value: '$250.00', color: 'from-yellow-400 to-amber-500', icon: 'D' },
  { symbol: 'LINK', name: 'Chainlink', balance: '42.80', balanceNum: 42.8, value: '$612.04', color: 'from-blue-600 to-indigo-600', icon: 'LN' },
  { symbol: 'UNI', name: 'Uniswap', balance: '15.00', balanceNum: 15, value: '$112.50', color: 'from-pink-400 to-pink-600', icon: 'UN' },
  { symbol: 'MATIC', name: 'Polygon', balance: '890.00', balanceNum: 890, value: '$534.00', color: 'from-purple-500 to-violet-600', icon: 'M' },
]

type Step = 'select-token' | 'send-form'

export function SendModal({ ethAddress, pqAddress, onClose }: SendModalProps) {
  const [step, setStep] = useState<Step>('select-token')
  const [search, setSearch] = useState('')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [selectedToken, setSelectedToken] = useState<TokenOption | null>(null)
  const [sending, setSending] = useState(false)
  const [addressType, setAddressType] = useState<'eth' | 'pq'>('eth')

  const fromAddress = addressType === 'eth' ? ethAddress : pqAddress

  const filteredTokens = useMemo(() => {
    if (!search.trim()) return TOKENS
    const q = search.toLowerCase()
    return TOKENS.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q)
    )
  }, [search])

  const handleSelectToken = (token: TokenOption) => {
    setSelectedToken(token)
    setStep('send-form')
    setSearch('')
  }

  const handleBack = () => {
    if (step === 'send-form') {
      setStep('select-token')
      setAmount('')
    } else {
      onClose()
    }
  }

  const handleSend = () => {
    if (!recipient || !amount || !selectedToken) return
    setSending(true)
    setTimeout(() => setSending(false), 2000)
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
              placeholder="0x... or qr_... address"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full bg-background/60 border border-border/50 rounded-xl px-3 py-2.5 text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
            />
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
              {amount && (
                <span className="text-[10px] text-muted-foreground">
                  ≈ ${(parseFloat(amount.replace(/,/g, '') || '0') * (parseFloat(token.value.replace(/[$,]/g, '')) / token.balanceNum)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
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
            <span className="text-[11px] font-medium">~0.002 ETH <span className="text-muted-foreground">($6.58)</span></span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Estimated time</span>
            </div>
            <span className="text-[11px] font-medium">~15 seconds</span>
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
      </div>

      {/* Sticky send button */}
      <div className="sticky bottom-0 p-4 glass-strong">
        <Button
          onClick={handleSend}
          disabled={!recipient || !amount || sending}
          className="w-full h-12 font-semibold text-base rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 disabled:opacity-40 disabled:shadow-none transition-all"
        >
          {sending ? (
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
