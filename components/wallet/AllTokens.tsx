'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import {
  ArrowLeft,
  Search,
  Pin,
  Star,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Check,
  GripVertical,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useTokenList, type Token } from './TokenList'

interface AllTokensProps {
  pinnedSymbols: string[]
  favoritedSymbols: string[]
  onPinnedChange: (pinned: string[]) => void
  onFavoritedChange: (favorited: string[]) => void
  onClose: () => void
}

type SortOption = 'value' | 'favorites' | 'name' | 'change'

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'value', label: 'Value' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'name', label: 'Name' },
  { key: 'change', label: '24h Change' },
]

const MAX_PINS = 4

export function AllTokens({
  pinnedSymbols,
  favoritedSymbols,
  onPinnedChange,
  onFavoritedChange,
  onClose,
}: AllTokensProps) {
  const allTokens = useTokenList()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('value')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragItem = useRef<number | null>(null)

  const togglePin = (symbol: string) => {
    if (pinnedSymbols.includes(symbol)) {
      onPinnedChange(pinnedSymbols.filter((s) => s !== symbol))
    } else if (pinnedSymbols.length < MAX_PINS) {
      onPinnedChange([...pinnedSymbols, symbol])
    }
  }

  const toggleFavorite = (symbol: string) => {
    if (favoritedSymbols.includes(symbol)) {
      onFavoritedChange(favoritedSymbols.filter((s) => s !== symbol))
    } else {
      onFavoritedChange([...favoritedSymbols, symbol])
    }
  }

  const sortedAndFiltered = useMemo(() => {
    let tokens = [...allTokens]

    // Filter
    if (search.trim()) {
      const q = search.toLowerCase()
      tokens = tokens.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q)
      )
    }

    // Sort
    switch (sortBy) {
      case 'value':
        tokens.sort((a, b) => b.valueNum - a.valueNum)
        break
      case 'favorites':
        tokens.sort((a, b) => {
          const aFav = favoritedSymbols.includes(a.symbol) ? 1 : 0
          const bFav = favoritedSymbols.includes(b.symbol) ? 1 : 0
          if (bFav !== aFav) return bFav - aFav
          return b.valueNum - a.valueNum
        })
        break
      case 'name':
        tokens.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'change':
        tokens.sort((a, b) => b.change24h - a.change24h)
        break
    }

    return tokens
  }, [search, sortBy, favoritedSymbols])

  const pinnedCount = pinnedSymbols.length

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
              <h1 className="text-base font-semibold">All Tokens</h1>
              <p className="text-[10px] text-muted-foreground">{allTokens.length} tokens · {pinnedCount}/{MAX_PINS} pinned</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="px-4 pt-3 pb-1 space-y-2">
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

        {/* Sort bar */}
        <div className="flex items-center justify-between">
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg bg-accent/30 hover:bg-accent/50"
            >
              Sort: {SORT_OPTIONS.find((o) => o.key === sortBy)?.label}
              <ChevronDown className={`h-3 w-3 transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
            </button>

            {showSortMenu && (
              <div className="absolute top-full left-0 mt-1 z-30 bg-background border border-border/50 rounded-xl shadow-lg overflow-hidden min-w-[130px]">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => {
                      setSortBy(option.key)
                      setShowSortMenu(false)
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium hover:bg-accent/30 transition-colors ${
                      sortBy === option.key ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    {option.label}
                    {sortBy === option.key && <Check className="h-3 w-3 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Pinned section — drag to reorder */}
      {pinnedSymbols.length > 0 && !search.trim() && (
        <div className="px-4 pt-2">
          <div className="flex items-center justify-between px-1 pb-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Pinned to Dashboard
            </span>
            <span className="text-[9px] text-muted-foreground/50">Drag to reorder</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
            {pinnedSymbols.map((sym, index) => {
              const token = allTokens.find((t) => t.symbol === sym)
              if (!token) return null
              return (
                <div
                  key={sym}
                  draggable
                  onDragStart={(e) => {
                    dragItem.current = index
                    e.dataTransfer.effectAllowed = 'move'
                    setDragOverIndex(null)
                    // Make drag image slightly transparent
                    if (e.currentTarget instanceof HTMLElement) {
                      e.currentTarget.style.opacity = '0.5'
                    }
                  }}
                  onDragEnd={(e) => {
                    if (e.currentTarget instanceof HTMLElement) {
                      e.currentTarget.style.opacity = '1'
                    }
                    dragItem.current = null
                    setDragOverIndex(null)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (dragOverIndex !== index) {
                      setDragOverIndex(index)
                    }
                  }}
                  onDragLeave={() => {
                    setDragOverIndex(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragItem.current === null || dragItem.current === index) return
                    const newPinned = [...pinnedSymbols]
                    const [dragged] = newPinned.splice(dragItem.current, 1)
                    newPinned.splice(index, 0, dragged)
                    onPinnedChange(newPinned)
                    dragItem.current = null
                    setDragOverIndex(null)
                  }}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border cursor-grab active:cursor-grabbing select-none transition-all shrink-0 ${
                    dragOverIndex === index
                      ? 'bg-primary/20 border-primary/40 scale-105'
                      : 'bg-primary/10 border-primary/20 hover:border-primary/30'
                  }`}
                >
                  <GripVertical className="h-3 w-3 text-primary/30 shrink-0" />
                  <div className={`h-4 w-4 rounded-[4px] bg-gradient-to-br ${token.color} flex items-center justify-center`}>
                    <span className="text-white text-[7px] font-bold">{token.symbol.slice(0, 2)}</span>
                  </div>
                  <span className="text-[10px] font-semibold">{token.symbol}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePin(sym)
                    }}
                    className="text-primary/60 hover:text-primary transition-colors"
                  >
                    <Pin className="h-2.5 w-2.5 fill-current" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Token List */}
      <div className="flex-1 px-4 py-2 space-y-0.5 overflow-y-auto">
        {sortedAndFiltered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No tokens found</p>
            <p className="text-[10px] opacity-60">Try a different search</p>
          </div>
        ) : (
          sortedAndFiltered.map((token) => {
            const isPinned = pinnedSymbols.includes(token.symbol)
            const isFavorited = favoritedSymbols.includes(token.symbol)
            const canPin = pinnedSymbols.length < MAX_PINS || isPinned

            return (
              <div
                key={token.symbol}
                className="flex items-center gap-2.5 px-2 py-2.5 rounded-xl hover:bg-accent/30 transition-all group"
              >
                {/* Token icon */}
                <Avatar className="h-9 w-9 shadow-sm shrink-0">
                  <AvatarImage src={token.icon} alt={token.symbol} />
                  <AvatarFallback className={`bg-gradient-to-br ${token.color} text-white text-xs font-bold`}>
                    {token.symbol.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>

                {/* Token info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">{token.symbol}</span>
                    {isPinned && (
                      <Pin className="h-2.5 w-2.5 text-primary fill-primary" />
                    )}
                    {isFavorited && (
                      <Star className="h-2.5 w-2.5 text-yellow-400 fill-yellow-400" />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{token.name}</div>
                </div>

                {/* Value + change */}
                <div className="text-right shrink-0 mr-1">
                  <div className="text-sm font-semibold">{token.value}</div>
                  <div className="flex items-center gap-0.5 justify-end">
                    <span className="text-[10px] text-muted-foreground">{token.balance}</span>
                    <div
                      className={`flex items-center text-[10px] font-medium ${
                        token.change24h > 0 ? 'text-green-500' : token.change24h < 0 ? 'text-red-500' : 'text-muted-foreground'
                      }`}
                    >
                      {token.change24h > 0 ? (
                        <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                      ) : token.change24h < 0 ? (
                        <TrendingDown className="h-2.5 w-2.5 mr-0.5" />
                      ) : null}
                      {Math.abs(token.change24h).toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {/* Favorite */}
                  <button
                    onClick={() => toggleFavorite(token.symbol)}
                    className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all ${
                      isFavorited
                        ? 'text-yellow-400 bg-yellow-400/10'
                        : 'text-muted-foreground/30 hover:text-yellow-400 hover:bg-yellow-400/10'
                    }`}
                    title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star className={`h-3.5 w-3.5 ${isFavorited ? 'fill-current' : ''}`} />
                  </button>

                  {/* Pin */}
                  <button
                    onClick={() => canPin && togglePin(token.symbol)}
                    className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all ${
                      isPinned
                        ? 'text-primary bg-primary/10'
                        : canPin
                        ? 'text-muted-foreground/30 hover:text-primary hover:bg-primary/10'
                        : 'text-muted-foreground/15 cursor-not-allowed'
                    }`}
                    title={
                      isPinned
                        ? 'Unpin from dashboard'
                        : canPin
                        ? 'Pin to dashboard'
                        : `Max ${MAX_PINS} pins reached`
                    }
                  >
                    <Pin className={`h-3.5 w-3.5 ${isPinned ? 'fill-current' : ''}`} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Click outside to close sort menu */}
      {showSortMenu && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setShowSortMenu(false)}
        />
      )}
    </div>
  )
}
