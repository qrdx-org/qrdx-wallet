'use client'

import { ArrowDownCircle, ArrowUpRight, RefreshCw, ArrowLeftRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface QuickAction {
  icon: React.ReactNode
  label: string
  onClick: () => void
  variant?: 'default' | 'outline'
}

export function QuickActions() {
  const actions: QuickAction[] = [
    {
      icon: <ArrowUpRight className="h-5 w-5" />,
      label: 'Send',
      onClick: () => console.log('Send'),
    },
    {
      icon: <ArrowDownCircle className="h-5 w-5" />,
      label: 'Receive',
      onClick: () => console.log('Receive'),
    },
    {
      icon: <ArrowLeftRight className="h-5 w-5" />,
      label: 'Swap',
      onClick: () => console.log('Swap'),
    },
    {
      icon: <RefreshCw className="h-5 w-5" />,
      label: 'Buy',
      onClick: () => console.log('Buy'),
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-3">
      {actions.map((action) => (
        <Button
          key={action.label}
          variant="outline"
          onClick={action.onClick}
          className="flex flex-col h-auto py-4 gap-2 hover:bg-accent/50 hover:border-primary/50 transition-all"
        >
          <div className="text-primary">{action.icon}</div>
          <span className="text-xs font-medium">{action.label}</span>
        </Button>
      ))}
    </div>
  )
}
