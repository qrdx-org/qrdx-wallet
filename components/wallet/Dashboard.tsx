'use client'

import { useState } from 'react'

export function Dashboard() {
  const [balance] = useState('0.00')

  const handleLock = () => {
    localStorage.setItem('qrdx_wallet_state', JSON.stringify({
      initialized: true,
      locked: true,
      version: '1.0.0'
    }))
    window.location.reload()
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">QRDX Wallet</h1>
          <button
            onClick={handleLock}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors"
          >
            Lock
          </button>
        </div>

        {/* Balance Card */}
        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground">Total Balance</p>
          <h2 className="text-5xl font-bold">${balance}</h2>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-3 gap-4">
          <button className="flex flex-col items-center space-y-3 p-6 bg-card border border-border rounded-xl hover:bg-accent transition-colors">
            <span className="text-4xl">📤</span>
            <span className="font-semibold">Send</span>
          </button>
          <button className="flex flex-col items-center space-y-3 p-6 bg-card border border-border rounded-xl hover:bg-accent transition-colors">
            <span className="text-4xl">📥</span>
            <span className="font-semibold">Receive</span>
          </button>
          <button className="flex flex-col items-center space-y-3 p-6 bg-card border border-border rounded-xl hover:bg-accent transition-colors">
            <span className="text-4xl">💱</span>
            <span className="font-semibold">Swap</span>
          </button>
        </div>

        {/* Assets */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Assets</h3>
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted-foreground">No assets yet</p>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Recent Activity</h3>
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted-foreground">No transactions yet</p>
          </div>
        </div>
      </div>
    </div>
  )
}
