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
  LayoutGrid,
  X } from 'lucide-react'
import { useBubble } from '@/components/gfx/Bubble'
import { SoapBubbleIconButton } from '@/components/soap-bubble'

export type QuickActionType = 'send' | 'receive' | 'swap' | 'buy' | 'shield' | 'trade' | 'stake'

interface QuickActionsProps {
  onAction?: (action: QuickActionType) => void
  /** The actions that work on the selected network; all when omitted. */
  available?: QuickActionType[]
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
    gradient: 'from-primary to-primary/70',
  },
  {
    key: 'receive',
    icon: <ArrowDownLeft className="h-5 w-5" />,
    label: 'Receive',
    gradient: 'from-primary to-primary/70',
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
    gradient: 'from-primary to-primary/70',
  },
  {
    key: 'buy',
    icon: <CreditCard className="h-5 w-5" />,
    label: 'Fund',
    gradient: 'from-primary to-primary/70',
  },
  {
    key: 'trade',
    icon: <TrendingUp className="h-5 w-5" />,
    label: 'Trade',
    gradient: 'from-primary to-primary/70',
  },
  {
    key: 'stake',
    icon: <Landmark className="h-5 w-5" />,
    label: 'Stake',
    gradient: 'from-primary to-primary/70',
  },
]

// Mini icon for the folder preview (2x2 grid)
function FolderMiniIcon({ gradient }: { gradient: string }) {
  return (
    <div className={`h-3 w-3 rounded-[3px] bg-gradient-to-br ${gradient}`} />
  )
}

/** In the liquid bubble look: a round soap bubble holding the icon, its label underneath. */
function BubbleTile({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-1.5">
      <SoapBubbleIconButton aria-label={label} onClick={onClick} className="text-foreground" style={{ fontSize: 18 }}>
        {children}
      </SoapBubbleIconButton>
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
    </div>
  )
}

function ActionTile({ action, onClick }: { action: QuickAction; onClick: () => void }) {
  const bubble = useBubble()
  if (bubble.on)
    return (
      <BubbleTile label={action.label} onClick={onClick}>
        {action.icon}
      </BubbleTile>
    )
  return (
    <button
      onClick={onClick}
      className="glass group flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl hover:border-primary/30 hover:bg-primary/5 transition-all"
    >
      <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${action.gradient} flex items-center justify-center text-primary-foreground shadow-sm group-hover:scale-105 transition-transform`}>
        {action.icon}
      </div>
      <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">{action.label}</span>
    </button>
  )
}

export function QuickActions({ onAction, available }: QuickActionsProps) {
  const bubble = useBubble()
  const [folderOpen, setFolderOpen] = useState(false)
  const shown = (a: QuickAction) => !available || available.includes(a.key)
  // A folder of one is a detour: that action joins the main row.
  const extra = FOLDER_ACTIONS.filter(shown)
  const main = [...MAIN_ACTIONS.filter(shown), ...(extra.length === 1 ? extra : [])]
  const folder = extra.length === 1 ? [] : extra
  const columns = main.length + (folder.length ? 1 : 0)

  return (
    <div className="space-y-1.5">
      {/* Main row: 3 actions + folder */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {main.map((action) => (
          <ActionTile key={action.key} action={action} onClick={() => onAction?.(action.key)} />
        ))}

        {/* Folder button */}
        {folder.length > 0 && bubble.on && (
          <BubbleTile label="More" onClick={() => setFolderOpen(!folderOpen)}>
            {folderOpen ? <X /> : <LayoutGrid />}
          </BubbleTile>
        )}
        {folder.length > 0 && !bubble.on && (
        <button
          onClick={() => setFolderOpen(!folderOpen)}
          className={`glass group flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl transition-all ${
            folderOpen ? 'bg-primary/10 border-primary/30' : 'hover:border-primary/30 hover:bg-primary/5'
          }`}
        >
          <div className="h-9 w-9 rounded-lg bg-muted/80 border border-border/50 flex items-center justify-center group-hover:scale-105 transition-transform overflow-hidden">
            {folderOpen ? (
              <X className="h-4 w-4 text-muted-foreground" />
            ) : (
              <div className="grid grid-cols-2 gap-[3px]">
                {folder.map((a) => (
                  <FolderMiniIcon key={a.key} gradient={a.gradient} />
                ))}
              </div>
            )}
          </div>
          <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">More</span>
        </button>
        )}
      </div>

      {/* Expanded folder tray */}
      {folderOpen && (
        <div className="grid grid-cols-4 gap-1.5 px-0 animate-in slide-in-from-top-2 fade-in duration-200">
          {folder.map((action) => (
            <ActionTile
              key={action.key}
              action={action}
              onClick={() => {
                onAction?.(action.key)
                setFolderOpen(false)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
