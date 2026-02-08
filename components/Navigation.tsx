'use client'

import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/theme-toggle'

export function Navigation() {
  return (
    <div className="border-b bg-card sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-600" />
            <span className="font-bold text-lg">QRDX Wallet</span>
          </div>
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search tokens, NFTs, or addresses..."
              className="pl-10"
            />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}
