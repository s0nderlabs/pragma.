'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/useThemeStore'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { WalletCard } from './WalletCard'
import { SpaceNavigation } from './SpaceNavigation'
import { ActivityTab } from './tabs/ActivityTab'
import { SessionsTab } from './tabs/SessionsTab'
import { ToolsTab } from './tabs/ToolsTab'

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
  const { theme } = useThemeStore()
  const { isOpen, toggle } = useSidebarStore()
  const [activeTab, setActiveTab] = useState<'activity' | 'sessions' | 'tools'>('activity')
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

  const isDark = theme === 'pragma-dark'

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
            initial={{ x: -380 }}
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
              "fixed left-6 top-6 bottom-6 z-30",
              "w-[380px]",
              "flex flex-col",
              "overflow-hidden"
            )}
          >
            {/* Glass morphism background */}
            <div
              className={cn(
                "absolute inset-0",
                "rounded-[32px]",
                isDark
                  ? "bg-gray-900/80 backdrop-blur-xl border border-white/10"
                  : "bg-white/80 backdrop-blur-xl border border-black/5"
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
              <div className={cn(
                "mx-6 h-px",
                isDark ? "bg-white/10" : "bg-black/5"
              )} />

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
                  {activeTab === 'tools' && (
                    <motion.div
                      key="tools"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ToolsTab
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