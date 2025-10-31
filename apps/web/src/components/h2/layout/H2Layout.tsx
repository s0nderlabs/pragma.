'use client'

import { useThemeStore } from '@/stores/useThemeStore'
import { useIdentity } from '@/hooks/useIdentity'
import Background from '../Background'
import { MobileHeader } from './MobileHeader'
import { ChatContainer } from './ChatContainer'
import { SimplifiedOnboarding } from '../onboarding/SimplifiedOnboarding'

/**
 * H2Layout Component
 *
 * Main layout orchestrator for H2 UI with onboarding flow.
 *
 * H2 Onboarding Flow (Simplified):
 * 1. User not connected → Show SimplifiedOnboarding (just connect button)
 * 2. User clicks Connect → Web3Auth modal opens
 * 3. Web3Auth returns wallet → HybridDelegator auto-deployed
 * 4. User immediately sees ChatContainer (NO delegation modal!)
 *
 * Key H2 Difference:
 * - NO delegation issuance during onboarding
 * - Ephemeral delegations created just-in-time (after quote confirmation)
 *
 * Components:
 * - Background: Iridescence shader (z-0)
 * - MobileHeader: Hamburger menu (z-40, mobile only, chat only)
 * - SimplifiedOnboarding: Connect wallet screen (if not connected)
 * - ChatContainer: Fullscreen glass panel with sidebar + chat (z-20, if connected)
 */
export function H2Layout() {
  const { theme } = useThemeStore()
  const { status, wallet } = useIdentity()

  // Show onboarding if not connected
  const showOnboarding = status !== 'connected' || !wallet

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      data-theme={theme}
      style={{
        color: theme === 'pragma-light' ? '#224' : '#e1e1e1',
      }}
    >
      {/* Background - Iridescence shader (z-0) */}
      <Background />

      {/* Mobile Header (z-40, mobile only, chat only) */}
      {!showOnboarding && <MobileHeader />}

      {/* Main Content Area (z-20) */}
      <div className="relative z-20 h-screen pt-16 lg:pt-0">
        {showOnboarding ? (
          /* Simplified onboarding - just connect button */
          <SimplifiedOnboarding />
        ) : (
          /* Chat interface - no delegation modal needed */
          <ChatContainer />
        )}
      </div>
    </div>
  )
}
