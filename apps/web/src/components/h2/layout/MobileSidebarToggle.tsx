'use client'

import { SidebarSimple } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSidebarStore } from '@/stores/useSidebarStore'

/**
 * Floating sidebar toggle for mobile (Arc browser inspired)
 * Only visible on mobile when sidebar is closed
 */
export function MobileSidebarToggle() {
  const { isMobileOpen, setMobileOpen } = useSidebarStore()

  return (
    <AnimatePresence>
      {!isMobileOpen && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2 }}
          onClick={() => setMobileOpen(true)}
          className="fixed top-4 left-4 z-50 lg:hidden
            w-10 h-10 rounded-xl
            flex items-center justify-center
            active:scale-95 transition-transform"
          style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
          aria-label="Open sidebar"
        >
          <SidebarSimple className="w-5 h-5 text-foreground/70" weight="regular" />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
