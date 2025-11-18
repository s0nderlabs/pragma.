'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { WalletCard } from './WalletCard'
import { SpaceNavigation } from './SpaceNavigation'
import { ActivityTab } from './tabs/ActivityTab'
import { SessionsTab } from './tabs/SessionsTab'
import { SettingsTab } from './tabs/SettingsTab'

interface MinimalSidebarProps {
  status: string
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
  const { isOpen, toggle } = useSidebarStore()
  const [activeTab, setActiveTab] = useState<'activity' | 'sessions' | 'settings'>('activity')
  const [openMethod, setOpenMethod] = useState<'hover' | 'keyboard' | null>(null)
  const [isHovering, setIsHovering] = useState(false)

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
  }, [])

  // Keyboard shortcut for collapse
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        setIsCollapsed(!isCollapsed, 'keyboard')
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [isCollapsed])

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
  }, [isCollapsed, isHovering])

  // Handle mouse leave for hover-opened sidebar
  const handleSidebarMouseLeave = () => {
    if (openMethod === 'hover') {
      setIsCollapsed(true)
      setIsHovering(false)
    }
  }

  // Use real wallet data from useIdentity hook
  const walletData = {
    balance: 2847.32, // TODO: Fetch real balance from blockchain
    change24h: 5.2, // TODO: Calculate from historical data
    address: wallet?.address || '0x0000000000000000000000000000000000000000'
  }

  return (
    <>
      {/* Main Sidebar Container */}
      <AnimatePresence mode="wait">
        {!isCollapsed && (
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
                  {activeTab === 'sessions' && (
                    <motion.div
                      key="sessions"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <SessionsTab />
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


    </>
  )
}