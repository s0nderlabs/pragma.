/**
 * QuickModeTutorial - Step 4 of Quickstart
 *
 * Tutorial explaining Quick Mode (yolo mode) for faster transactions.
 * Elegant stagger animations with serif typography.
 */

'use client'

import { motion } from 'framer-motion'
import { Zap, Shield, Clock, AlertTriangle, ArrowUpRight } from 'lucide-react'

export function QuickModeTutorial() {
  return (
    <div className="flex-1 flex flex-col px-4 sm:px-10 pb-4">
      {/* Header with serif typography */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6"
      >
        <h2 className="text-2xl md:text-3xl font-serif font-light tracking-tight text-white/90 mb-3">
          Quick Mode
        </h2>
        <p className="text-sm text-white/50">
          Skip confirmation dialogs for faster transactions. Great for experienced users.
        </p>
      </motion.div>

      {/* Visual Demo */}
      <div className="flex-1 flex flex-col justify-center">
        {/* Mode Comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Normal Mode */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-blue-500/20">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="font-medium text-white/90">Normal Mode</div>
                <div className="text-xs text-white/50">Default</div>
              </div>
            </div>

            <ul className="space-y-2.5 text-sm text-white/70">
              <li className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-white/40 mt-0.5 flex-shrink-0" />
                <span>Shows quote before execution</span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-white/40 mt-0.5 flex-shrink-0" />
                <span>Requires confirmation</span>
              </li>
            </ul>

            <div className="mt-4 pt-3 border-t border-white/5 text-xs text-white/40">
              Best for: New users, large transactions
            </div>
          </motion.div>

          {/* Quick Mode */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-[#E07A5F]/30 bg-[#E07A5F]/5 p-5"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-[#E07A5F]/20">
                <Zap className="w-5 h-5 text-[#E07A5F]" />
              </div>
              <div>
                <div className="font-medium text-white/90">Quick Mode</div>
                <div className="text-xs text-[#E07A5F]">Yolo</div>
              </div>
            </div>

            <ul className="space-y-2.5 text-sm text-white/70">
              <li className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-[#E07A5F] mt-0.5 flex-shrink-0" />
                <span>Executes immediately</span>
              </li>
              <li className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-[#E07A5F] mt-0.5 flex-shrink-0" />
                <span>No confirmation needed</span>
              </li>
            </ul>

            <div className="mt-4 pt-3 border-t border-white/5 text-xs text-[#E07A5F]/60">
              Best for: Experienced users, small trades
            </div>
          </motion.div>
        </div>

        {/* Toggle Demo */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 rounded-[28px] bg-zinc-800/60 border border-zinc-700/50 p-3"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full text-[#E07A5F]">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <span className="flex-1 text-sm text-white/40">What&apos;s the play?</span>
            <button className="flex items-center gap-1 px-4 py-2 rounded-full bg-white text-black text-sm font-medium">
              Send
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="mt-3 text-xs text-white/40 text-center">
            Tap the <Zap className="w-3 h-3 inline text-[#E07A5F]" /> to toggle Quick Mode
          </p>
        </motion.div>

        {/* Warning */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="mt-4 flex items-start justify-center gap-2 text-xs text-white/40"
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Quick Mode transactions execute without review. Use with caution.</span>
        </motion.div>
      </div>
    </div>
  )
}
