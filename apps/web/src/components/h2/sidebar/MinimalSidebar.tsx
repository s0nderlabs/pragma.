'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { useShortcutPanelStore } from '@/stores/useShortcutPanelStore'
import { useWalletBalance } from '@/hooks/useWalletBalance'
import { useNotificationStore } from '@/stores/useNotificationStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { WalletCard } from './WalletCard'
import { SpaceNavigation } from './SpaceNavigation'
import { ActivityTab } from './tabs/ActivityTab'
import { BalancesTab } from './tabs/BalancesTab'
import { SettingsTab } from './tabs/SettingsTab'
import { CopyNotification } from '../notifications/CopyNotification'

interface MinimalSidebarProps {
  status: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

/**
 * MinimalSidebar - Apple × Dieter Rams Design
 *
 * "Less, but better" - Functional beauty through restraint
 * Clean information architecture with tab-based navigation
 * Drawer slide collapse with floating balance trigger
 */
export function MinimalSidebar({ status, wallet, connect, disconnect }: MinimalSidebarProps) {
  const { isOpen, toggle, toggleBalance, isMobileOpen, setMobileOpen } = useSidebarStore()
  const isMobile = useIsMobile()
  const sessionData = useH2ChatStore((state) => state.sessionData)
  const setBalanceRefreshCallback = useH2ChatStore((state) => state.setBalanceRefreshCallback)
  const toggleQuickMode = useH2ChatStore((state) => state.toggleQuickMode)
  const { theme: pragmaTheme, setTheme: setZustandTheme } = useThemeStore()
  const { monBalance, usdValue, change24h, isLoading, refresh } = useWalletBalance()
  const { showCopy, showCopyNotification } = useNotificationStore()
  const toggleShortcutPanel = useShortcutPanelStore((state) => state.toggle)
  const [activeTab, setActiveTab] = useState<'activity' | 'balances' | 'settings'>('activity')
  const [openMethod, setOpenMethod] = useState<'hover' | 'keyboard' | null>(null)
  const [isHovering, setIsHovering] = useState(false)

  // Theme toggle handler - write ONLY to Zustand (ThemeSynchronizer handles next-themes sync)
  const handleThemeToggle = useCallback(() => {
    const newPragmaTheme = pragmaTheme === 'pragma-dark' ? 'pragma-light' : 'pragma-dark'
    setZustandTheme(newPragmaTheme)
  }, [pragmaTheme, setZustandTheme])

  // Invert isOpen to get isCollapsed for clearer logic
  const isCollapsed = !isOpen
  const setIsCollapsed = (collapsed: boolean, method?: 'hover' | 'keyboard') => {
    if (collapsed !== isCollapsed) {
      toggle()
      setOpenMethod(collapsed ? null : (method || 'keyboard'))
    }
  }

  // Track mounted state to skip initial animation on page load
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Register balance refresh callback for immediate updates after transactions
  useEffect(() => {
    setBalanceRefreshCallback(refresh)
    return () => {
      setBalanceRefreshCallback(null)
    }
  }, [refresh, setBalanceRefreshCallback])

  // Auto-collapse on smaller screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1280) {
        setIsCollapsed(true)
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keyboard shortcuts (direct event listener - uses event.code for macOS compatibility)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt + \ - Toggle sidebar
      if (e.code === 'Backslash' && e.altKey) {
        e.preventDefault()
        setIsCollapsed(!isCollapsed, 'keyboard')
      }
      // Alt + , - Settings
      else if (e.code === 'Comma' && e.altKey) {
        e.preventDefault()
        setActiveTab('settings')
      }
      // Alt + a - Activity
      else if (e.code === 'KeyA' && e.altKey) {
        e.preventDefault()
        setActiveTab('activity')
      }
      // Alt + b - Balances
      else if (e.code === 'KeyB' && e.altKey) {
        e.preventDefault()
        setActiveTab('balances')
      }
      // Alt + m - Quick Mode
      else if (e.code === 'KeyM' && e.altKey) {
        e.preventDefault()
        toggleQuickMode()
      }
      // Alt + t - Theme
      else if (e.code === 'KeyT' && e.altKey) {
        e.preventDefault()
        handleThemeToggle()
      }
      // Alt + / - Focus chat input
      else if (e.code === 'Slash' && e.altKey) {
        e.preventDefault()
        const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement
        chatInput?.focus()
      }
      // Alt + c - Copy wallet address
      else if (e.code === 'KeyC' && e.altKey) {
        e.preventDefault()
        const address = sessionData?.delegator || wallet?.address || '0x0000000000000000000000000000000000000000'
        navigator.clipboard.writeText(address)
        showCopyNotification()
      }
      // Alt + k - Show keyboard shortcuts
      else if (e.code === 'KeyK' && e.altKey) {
        e.preventDefault()
        toggleShortcutPanel()
      }
      // Alt + h - Hide/show balance
      else if (e.code === 'KeyH' && e.altKey) {
        e.preventDefault()
        toggleBalance()
      }
      // Alt + Arrow Left/Right - Navigate tabs
      else if (e.code === 'ArrowLeft' && e.altKey) {
        e.preventDefault()
        const tabs: Array<'activity' | 'balances' | 'settings'> = ['activity', 'balances', 'settings']
        const currentIndex = tabs.indexOf(activeTab)
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1
        setActiveTab(tabs[prevIndex])
      }
      else if (e.code === 'ArrowRight' && e.altKey) {
        e.preventDefault()
        const tabs: Array<'activity' | 'balances' | 'settings'> = ['activity', 'balances', 'settings']
        const currentIndex = tabs.indexOf(activeTab)
        const nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0
        setActiveTab(tabs[nextIndex])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCollapsed, handleThemeToggle, toggleQuickMode, toggleBalance, sessionData, wallet, toggleShortcutPanel, activeTab])

  // Arc-style edge hover detection
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const nearLeftEdge = e.clientX <= 10

      if (nearLeftEdge && isCollapsed && !isHovering) {
        setIsHovering(true)
        setIsCollapsed(false, 'hover')
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollapsed, isHovering])

  // Handle mouse leave for hover-opened sidebar
  const handleSidebarMouseLeave = () => {
    if (openMethod === 'hover') {
      setIsCollapsed(true)
      setIsHovering(false)
    }
  }

  // Use real wallet data from Monorail API
  const walletData = {
    balance: isLoading ? 0 : usdValue,
    change24h: isLoading ? 0 : change24h,
    address: sessionData?.delegator || wallet?.address || '0x0000000000000000000000000000000000000000',
    monBalance: isLoading ? '0' : monBalance,
  }

  return (
    <>
      {/* Main Sidebar Container */}
      <AnimatePresence mode="wait">
        {mounted && !isCollapsed && (
          <motion.aside
            // Skip initial animation on page load to prevent glitch
            initial={mounted ? { x: -380 } : { x: 0 }}
            animate={{
              x: 0,
              transition: {
                type: "spring",
                damping: 30,
                stiffness: 300
              }
            }}
            exit={{
              x: -380,
              transition: {
                type: "tween",
                duration: 0.15,
                ease: "easeOut"
              }
            }}
            className={cn(
              "fixed left-0 top-0 bottom-0 z-30",
              "w-[380px]",
              "flex flex-col",
              "overflow-hidden"
            )}
          >
            {/* Dark gray background - lighter in light mode, darker in dark mode */}
            <div
              className={cn(
                "absolute inset-0",
                "bg-[#2a2a2a] dark:bg-[#0a0a0a]",
                "border-r border-white/10"
              )}
            />

            {/* Content Container */}
            <div
              className="relative flex flex-col h-full"
              onMouseLeave={handleSidebarMouseLeave}
            >
              {/* Fixed Wallet Section */}
              <div className="flex-shrink-0">
                <WalletCard
                  balance={walletData.balance}
                  change24h={walletData.change24h}
                  address={walletData.address}
                  monBalance={walletData.monBalance}
                />
              </div>

              {/* Divider */}
              <div className="mx-6 h-px bg-black/5 dark:bg-white/10" />

              {/* Space Navigation - Arc Style */}
              <div className="flex-shrink-0 px-6 py-3">
                <SpaceNavigation
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                />
              </div>

              {/* Tab Content Area - Scrollable with more padding */}
              <div className="flex-1 overflow-y-auto px-6 pb-6">
                <AnimatePresence mode="wait">
                  {activeTab === 'activity' && (
                    <motion.div
                      key="activity"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ActivityTab />
                    </motion.div>
                  )}
                  {activeTab === 'balances' && (
                    <motion.div
                      key="balances"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <BalancesTab />
                    </motion.div>
                  )}
                  {activeTab === 'settings' && (
                    <motion.div
                      key="settings"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <SettingsTab
                        status={status}
                        wallet={wallet}
                        connect={connect}
                        disconnect={disconnect}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile Overlay - 80vw drawer (Apple-level experience) */}
      {isMobile && (
        <>
          {/* Backdrop */}
          <AnimatePresence>
            {isMobileOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
                onClick={() => setMobileOpen(false)}
              />
            )}
          </AnimatePresence>

          {/* Mobile Sidebar Drawer - 80vw */}
          <AnimatePresence>
            {isMobileOpen && (
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed left-0 top-0 bottom-0 z-50 w-[80vw] max-w-[380px]
                  bg-[#2a2a2a] dark:bg-[#0a0a0a] border-r border-white/5 lg:hidden
                  flex flex-col overflow-hidden"
                style={{
                  paddingTop: 'env(safe-area-inset-top, 0px)',
                  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                }}
              >
                {/* Mobile Sidebar Content - tap backdrop to close */}
                <div className="flex flex-col h-full">
                  {/* Fixed Wallet Section */}
                  <div className="flex-shrink-0">
                    <WalletCard
                      balance={walletData.balance}
                      change24h={walletData.change24h}
                      address={walletData.address}
                      monBalance={walletData.monBalance}
                    />
                  </div>

                  {/* Divider */}
                  <div className="mx-6 h-px bg-black/5 dark:bg-white/10" />

                  {/* Space Navigation */}
                  <div className="flex-shrink-0 px-6 py-3">
                    <SpaceNavigation
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                    />
                  </div>

                  {/* Tab Content Area - Scrollable */}
                  <div className="flex-1 overflow-y-auto px-6 pb-6">
                    <AnimatePresence mode="wait">
                      {activeTab === 'activity' && (
                        <motion.div
                          key="activity-mobile"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ActivityTab />
                        </motion.div>
                      )}
                      {activeTab === 'balances' && (
                        <motion.div
                          key="balances-mobile"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                        >
                          <BalancesTab />
                        </motion.div>
                      )}
                      {activeTab === 'settings' && (
                        <motion.div
                          key="settings-mobile"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                        >
                          <SettingsTab
                            status={status}
                            wallet={wallet}
                            connect={connect}
                            disconnect={disconnect}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Copy notification toast */}
      <CopyNotification show={showCopy} />
    </>
  )
}