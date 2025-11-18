'use client'

import { X } from 'lucide-react'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { TerminalCard } from '@/components/ui/terminal/TerminalCard'
import { AsciiDivider, AsciiHeader, AsciiStatus } from '@/components/ui/terminal/AsciiComponents'
import { BalanceTerminal } from '../sidebar/BalanceTerminal'
import { ChatHistory } from '../sidebar/ChatHistory'
import { ReceiptArchive } from '../sidebar/ReceiptArchive'
import { SettingsPanel } from '../sidebar/SettingsPanel'

/**
 * Terminal Sidebar Component - Brutalist Terminal Design
 *
 * ASCII-styled terminal interface:
 * - Solid grayscale cards with black borders
 * - IBM Plex Mono throughout
 * - Collapsible sections with [+]/[-] indicators
 * - No glass effects, pure terminal aesthetic
 */
export function TerminalSidebar() {
  const { activeSection, setActiveSection, setMobileOpen } = useSidebarStore()
  const { theme } = useThemeStore()

  const toggleSection = (section: 'history' | 'receipts' | 'settings') => {
    setActiveSection(activeSection === section ? null : section)
  }

  return (
    <div className="h-full p-4 bg-card terminal-grid-pattern">
      {/* Main Terminal Container - Brutalist Style */}
      <div className="h-full border-2 border-border bg-card flex flex-col">
        {/* Terminal Header - Harsh ASCII */}
        <div className="border-b-2 border-border px-4 py-2 bg-card">
          <div className="flex items-center justify-between">
            <div className="font-mono text-sm text-accent">
              <span>PRAGMA://H2.5</span>
            </div>
            {/* Mobile Close Button */}
            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden font-mono text-muted hover:text-foreground transition-colors"
              aria-label="Close sidebar"
            >
              [X]
            </button>
          </div>
        </div>

        {/* Balance Terminal */}
        <div className="border-b-2 border-border">
          <BalanceTerminal />
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Chat Section */}
          <TerminalCard
            title="▣ CHAT HISTORY"
            collapsible
            defaultCollapsed={activeSection !== 'history'}
            className="border-2"
            variant={activeSection === 'history' ? 'active' : 'default'}
          >
            <div className="pt-2">
              <ChatHistory />
            </div>
          </TerminalCard>

          {/* Activity Section */}
          <TerminalCard
            title="▤ ACTIVITY LOG"
            collapsible
            defaultCollapsed={activeSection !== 'receipts'}
            className="border-2"
            variant={activeSection === 'receipts' ? 'active' : 'default'}
          >
            <div className="pt-2">
              <ReceiptArchive />
            </div>
          </TerminalCard>

          {/* Settings Section */}
          <TerminalCard
            title="▥ SETTINGS"
            collapsible
            defaultCollapsed={activeSection !== 'settings'}
            className="border-2"
            variant={activeSection === 'settings' ? 'active' : 'default'}
          >
            <div className="pt-2">
              <SettingsPanel />
            </div>
          </TerminalCard>

          {/* System Status */}
          <div className="border-2 border-border bg-card p-3">
            <div className="font-mono text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted">SESSION:</span>
                <AsciiStatus status="active" label="ACTIVE" />
              </div>
              <div className="flex justify-between">
                <span className="text-muted">NETWORK:</span>
                <span className="text-accent">MONAD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">MODE:</span>
                <span className="text-foreground">NORMAL</span>
              </div>
            </div>
          </div>

          {/* ASCII Art Footer */}
          <div className="text-center py-4">
            <pre className="text-xs text-muted">
{`┌───────────────┐
│  TERMINAL v2  │
└───────────────┘`}
            </pre>
          </div>
        </div>

        {/* Bottom Status Bar */}
        <div className="border-t-2 border-border px-4 py-1 bg-card">
          <div className="font-mono text-xs text-muted flex justify-between">
            <span>READY</span>
            <span className="terminal-cursor"></span>
          </div>
        </div>
      </div>
    </div>
  )
}