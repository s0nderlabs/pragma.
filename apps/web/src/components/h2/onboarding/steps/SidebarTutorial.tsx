/**
 * SidebarTutorial - Step 2 of Quickstart
 *
 * Tutorial showing sidebar navigation with Activity, Balances, and Settings tabs.
 * Elegant stagger animations with serif typography.
 */

'use client'

import { motion } from 'framer-motion'
import { Activity, Wallet, Settings, Command } from 'lucide-react'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } }
}

export function SidebarTutorial() {
  return (
    <div className="flex-1 flex flex-col px-10 pb-4">
      {/* Header with serif typography */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8"
      >
        <h2 className="text-2xl md:text-3xl font-serif font-light tracking-tight text-white/90 mb-3">
          Navigate with the Sidebar
        </h2>
        <p className="text-sm text-white/50">
          Access your activity, balances, and settings from the left sidebar.
        </p>
      </motion.div>

      {/* Visual Demo */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md">
          {/* Mock Sidebar with staggered items */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden"
          >
            {/* Tab Items */}
            <div className="divide-y divide-white/5">
              {/* Activity Tab */}
              <motion.div variants={item} className="flex items-center gap-4 p-5 bg-white/[0.03]">
                <div className="p-3 rounded-xl bg-[#E07A5F]/20">
                  <Activity className="w-5 h-5 text-[#E07A5F]" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-white/90">Activity</div>
                  <div className="text-xs text-white/50">Transaction history</div>
                </div>
                <kbd className="px-2.5 py-1 rounded-lg bg-white/5 text-[10px] text-white/40 font-mono border border-white/10">
                  Alt+A
                </kbd>
              </motion.div>

              {/* Balances Tab */}
              <motion.div variants={item} className="flex items-center gap-4 p-5">
                <div className="p-3 rounded-xl bg-white/5">
                  <Wallet className="w-5 h-5 text-white/60" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-white/90">Balances</div>
                  <div className="text-xs text-white/50">Your token holdings</div>
                </div>
                <kbd className="px-2.5 py-1 rounded-lg bg-white/5 text-[10px] text-white/40 font-mono border border-white/10">
                  Alt+B
                </kbd>
              </motion.div>

              {/* Settings Tab */}
              <motion.div variants={item} className="flex items-center gap-4 p-5">
                <div className="p-3 rounded-xl bg-white/5">
                  <Settings className="w-5 h-5 text-white/60" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-white/90">Settings</div>
                  <div className="text-xs text-white/50">Preferences & session</div>
                </div>
                <kbd className="px-2.5 py-1 rounded-lg bg-white/5 text-[10px] text-white/40 font-mono border border-white/10">
                  Alt+C
                </kbd>
              </motion.div>
            </div>
          </motion.div>

          {/* Tip with delayed animation */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mt-5 flex items-center justify-center gap-2 text-xs text-white/40"
          >
            <Command className="w-3.5 h-3.5" />
            <span>Press <kbd className="px-1.5 py-0.5 rounded bg-white/5 font-mono border border-white/10">Alt+\</kbd> to toggle sidebar</span>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
