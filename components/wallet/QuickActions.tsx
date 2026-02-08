'use client'

import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight, CreditCard } from 'lucide-react'

interface QuickAction {
  icon: React.ReactNode
  label: string
  onClick: () => void
  gradient: string
}

export function QuickActions() {
  const actions: QuickAction[] = [
    {
      icon: <ArrowUpRight className="h-5 w-5" />,
      label: 'Send',
      onClick: () => console.log('Send'),
      gradient: 'from-blue-500 to-blue-600',
    },
    {
      icon: <ArrowDownLeft className="h-5 w-5" />,
      label: 'Receive',
      onClick: () => console.log('Receive'),
      gradient: 'from-green-500 to-emerald-600',
    },
    {
      icon: <ArrowLeftRight className="h-5 w-5" />,
      label: 'Swap',
      onClick: () => console.log('Swap'),
      gradient: 'from-primary to-primary/70',
    },
    {
      icon: <CreditCard className="h-5 w-5" />,
      label: 'Buy',
      onClick: () => console.log('Buy'),
      gradient: 'from-orange-500 to-amber-600',
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-2">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={action.onClick}
          className="group flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-background/50 border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all"
        >
          <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${action.gradient} flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform`}>
            {action.icon}
          </div>
          <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">{action.label}</span>
        </button>
      ))}
    </div>
  )
}
