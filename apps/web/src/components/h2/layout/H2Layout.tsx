'use client'

import { useH2Onboarding } from '@/hooks/useH2Onboarding'
import { useIdentity } from '@/hooks/useIdentity'
import { MobileHeader } from './MobileHeader'
import { ChatContainer } from './ChatContainer'
import { H2ErrorBoundary } from '../ErrorBoundary'

/**
 * H2Layout Component
 *
 * Main layout orchestrator for H2 UI - always shows chat interface.
 *
 * H2 UX Flow:
 * 1. User sees H2 chat interface immediately (no forced onboarding screen)
 * 2. User connects wallet via sidebar Settings panel
 * 3. Web3Auth modal opens → HybridDelegator auto-deployed
 * 4. User can now interact with H2 agent
 *
 * Key H2 Features:
 * - NO forced onboarding screen - clean interface from the start
 * - Login/logout controls in sidebar Settings accordion
 * - Ephemeral delegations created just-in-time (after quote confirmation)
 *
 * Components:
 * - Background: Iridescence shader (z-0)
 * - MobileHeader: Hamburger menu (z-40, mobile only)
 * - ChatContainer: Fullscreen glass panel with sidebar + chat (z-20)
 */
export function H2Layout() {
  // SINGLE source of truth for wallet state (prevents race condition)
  const { status, wallet, connect, disconnect } = useIdentity()

  // Auto-create H2 session after Web3Auth connects
  useH2Onboarding()

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Mobile Header (z-40, mobile only) */}
      <MobileHeader />

      {/* Main Content Area (z-20) */}
      <div className="relative z-20 h-screen pt-16 lg:pt-0">
        <H2ErrorBoundary>
          {/* Always show chat interface - login via sidebar */}
          <ChatContainer
            status={status}
            wallet={wallet}
            connect={connect}
            disconnect={disconnect}
          />
        </H2ErrorBoundary>
      </div>
    </div>
  )
}
