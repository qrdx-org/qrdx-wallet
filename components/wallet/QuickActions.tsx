'use client'

import { useState } from 'react'
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  CreditCard,
  Shield,
  TrendingUp,
  Landmark,
  Grid2x2,
  X,
} from 'lucide-react'

export type QuickActionType = 'send' | 'receive' | 'swap' | 'buy' | 'shield' | 'trade' | 'stake'

interface QuickActionsProps {
  onAction?: (action: QuickActionType) => void
}

interface QuickAction {
  key: QuickActionType
  icon: React.ReactNode
  label: string
  gradient: string
}

const MAIN_ACTIONS: QuickAction[] = [
  {
    key: 'send',
    icon: <ArrowUpRight className="h-5 w-5" />,
    label: 'Send',
    gradient: 'from-blue-500 to-blue-600',
  },
  {
    key: 'receive',
    icon: <ArrowDownLeft className="h-5 w-5" />,
    label: 'Receive',
    gradient: 'from-green-500 to-emerald-600',
  },
  {
    key: 'swap',
    icon: <ArrowLeftRight className="h-5 w-5" />,
    label: 'Swap',
    gradient: 'from-primary to-primary/70',
  },
]

const FOLDER_ACTIONS: QuickAction[] = [
  {
    key: 'shield',
    icon: <Shield className="h-5 w-5" />,
    label: 'Shield',
    gradient: 'from-cyan-500 to-teal-600',
  },
  {
    key: 'buy',
    icon: <CreditCard className="h-5 w-5" />,
    label: 'Buy',
    gradient: 'from-orange-500 to-amber-600',
  },
  {
    key: 'trade',
    icon: <TrendingUp className="h-5 w-5" />,
    label: 'Trade',
    gradient: 'from-rose-500 to-pink-600',
  },
  {
    key: 'stake',
    icon: <Landmark className="h-5 w-5" />,
    label: 'Stake',
    gradient: 'from-violet-500 to-purple-600',
  },
]

// Mini icon for the folder preview (2x2 grid)
function FolderMiniIcon({ gradient }: { gradient: string }) {
  return (
    <div className={`h-3 w-3 rounded-[3px] bg-gradient-to-br ${gradient}`} />
  )
}

export function QuickActions({ onAction }: QuickActionsProps) {
  const [folderOpen, setFolderOpen] = useState(false)

  return (
    <div className="space-y-1.5">
      {/* Main row: 3 actions + folder */}
      <div className="grid grid-cols-4 gap-1.5">
        {MAIN_ACTIONS.map((action) => (
          <button
            key={action.key}
            onClick={() => onAction?.(action.key)}
            className="group flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl bg-background/50 border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all"
          >
            <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${action.gradient} flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform`}>
              {action.icon}
            </div>
            <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">{action.label}</span>
          </button>
        ))}

        {/* Folder button */}
        <button
          onClick={() => setFolderOpen(!folderOpen)}
          className={`group flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border transition-all ${
            folderOpen
              ? 'bg-primary/10 border-primary/30'
              : 'bg-background/50 border-border/50 hover:border-primary/30 hover:bg-primary/5'
          }`}
        >
          <div className="h-9 w-9 rounded-lg bg-muted/80 border border-border/50 flex items-center justify-center group-hover:scale-105 transition-transform overflow-hidden">
            {folderOpen ? (
              <X className="h-4 w-4 text-muted-foreground" />
            ) : (
              <div className="grid grid-cols-2 gap-[3px]">
                {FOLDER_ACTIONS.map((a) => (
                  <FolderMiniIcon key={a.key} gradient={a.gradient} />
                ))}
              </div>
            )}
          </div>
          <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">More</span>
        </button>
      </div>

      {/* Expanded folder tray */}
      {folderOpen && (
        <div className="grid grid-cols-4 gap-1.5 px-0 animate-in slide-in-from-top-2 fade-in duration-200">
          {FOLDER_ACTIONS.map((action) => (
            <button
              key={action.key}
              onClick={() => {
                onAction?.(action.key)
                setFolderOpen(false)
              }}
              className="group flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl bg-background/50 border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all"
            >
              <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${action.gradient} flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform`}>
                {action.icon}
              </div>
              <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
