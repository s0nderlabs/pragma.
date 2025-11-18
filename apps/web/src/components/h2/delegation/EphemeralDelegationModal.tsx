/**
 * Ephemeral Delegation Modal
 *
 * Modal for signing ephemeral delegations (swaps, transfers, etc.)
 * Shows delegation details, risks, and triggers wallet signature request.
 */

'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from 'next-themes'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { X, AlertTriangle, Clock, ShieldCheck } from 'lucide-react'
import type { DelegationSignRequest } from '@/lib/h2/delegationService'
import { formatDelegationInfo, getDelegationTimeRemaining } from '@/lib/h2/delegationService'

interface EphemeralDelegationModalProps {
  isOpen: boolean
  onClose: () => void
  request: DelegationSignRequest | null
  onSign: () => Promise<void>
  isSigning: boolean
}

export function EphemeralDelegationModal({
  isOpen,
  onClose,
  request,
  onSign,
  isSigning,
}: EphemeralDelegationModalProps) {
  const { resolvedTheme } = useTheme()
  const [showRisks, setShowRisks] = useState(false)

  if (!request) return null

  const info = formatDelegationInfo(request)
  const timeRemaining = getDelegationTimeRemaining(request.expiresAt)

  const handleSign = async () => {
    try {
      await onSign()
      onClose()
    } catch (error) {
      console.error('Signing failed:', error)
      // Error will be displayed by parent component
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <LiquidGlassPanel
              theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
              className="w-full max-w-md rounded-3xl p-6 relative"
              blurAmount={8}
              displacementScale={0.5}
              stdDeviation={0.04}
            >
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5 opacity-60" />
              </button>

              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <ShieldCheck className="w-6 h-6 text-[#F2A694]" />
                  <h2 className="text-xl font-semibold">{info.title}</h2>
                </div>
                <p className="text-sm opacity-70">{info.description}</p>
              </div>

              {/* Expiry Timer */}
              <div className="mb-6 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                <div className="flex items-center gap-2 text-cyan-300">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Expires in {timeRemaining.minutes}m {timeRemaining.seconds}s
                  </span>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-3 mb-6">
                {info.details.map((detail, index) => (
                  <div key={index} className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-sm opacity-60">{detail.label}</span>
                    <span className="text-sm font-medium">{detail.value}</span>
                  </div>
                ))}
              </div>

              {/* Risks Toggle */}
              <button
                onClick={() => setShowRisks(!showRisks)}
                className="w-full mb-4 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-yellow-300">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm font-medium">Security Information</span>
                  </div>
                  <motion.div
                    animate={{ rotate: showRisks ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <svg className="w-4 h-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </motion.div>
                </div>
              </button>

              {/* Risks List (Collapsible) */}
              <AnimatePresence>
                {showRisks && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mb-6 overflow-hidden"
                  >
                    <ul className="space-y-2 text-xs opacity-70 pl-4">
                      {info.risks.map((risk, index) => (
                        <li key={index} className="list-disc">
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={isSigning}
                  className="flex-1 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSign}
                  disabled={isSigning}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#E07A5F] hover:bg-[#7D3F2B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {isSigning ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      />
                      Signing...
                    </span>
                  ) : (
                    'Sign Delegation'
                  )}
                </button>
              </div>
            </LiquidGlassPanel>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
