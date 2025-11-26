'use client'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Copy, ExternalLink, Check, X } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ActivityRecord } from '@/lib/h2/activityExtractor'
import {
  decodeFunctionName,
  getEnforcerName,
  shortenAddress,
  formatRelativeTime,
} from '@/lib/h2/delegationHelpers'
import { MONAD_BLOCK_EXPLORER_URL } from '@/lib/config'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import {
  modalContentVariants,
  modalContainerVariants,
  modalSectionVariants,
  modalSectionRowsVariants,
  modalRowVariants,
  springTransition,
  disabledTransition,
} from '@/lib/h2/motionVariants'

interface ActivityDetailModalProps {
  activity: ActivityRecord | null
  open: boolean
  onClose: () => void
}

const formatGas = (gas: string): string => {
  const gasNumber = parseInt(gas)
  if (gasNumber > 1000000) return `${(gasNumber / 1000000).toFixed(2)}M`
  if (gasNumber > 1000) return `${(gasNumber / 1000).toFixed(1)}K`
  return gas
}

function CopyButton({ value, field }: { value: string; field: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.button
      onClick={handleCopy}
      className="p-1.5 hover:bg-white/5 rounded transition-colors"
      whileTap={{ scale: 0.95 }}
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.div
            key="check"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Check className="w-3.5 h-3.5 text-blue-400" />
          </motion.div>
        ) : (
          <motion.div
            key="copy"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Copy className="w-3.5 h-3.5 text-white/40 hover:text-white/60" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

export function ActivityDetailModal({ activity, open, onClose }: ActivityDetailModalProps) {
  // Accessibility: Detect reduced motion preference
  // IMPORTANT: Hook must be called before early return (Rules of Hooks)
  const prefersReducedMotion = usePrefersReducedMotion()

  if (!activity) return null

  const explorerUrl = activity.txHash
    ? `${MONAD_BLOCK_EXPLORER_URL}/tx/${activity.txHash}`
    : null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl bg-black border border-white/10 p-0 overflow-hidden">
        <motion.div
          variants={modalContentVariants}
          initial="initial"
          animate="animate"
          transition={prefersReducedMotion ? disabledTransition : springTransition.fast}
          className="p-6 space-y-4"
        >
          {/* Header */}
          <div className="flex justify-between items-start gap-4">
            <DialogTitle className="text-sm font-semibold text-white/90 leading-tight">
              {activity.displayText || activity.type}
            </DialogTitle>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/5 rounded transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-white/40" />
            </button>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <div className="text-xs text-white/60">Status</div>
            <div
              className={cn(
                'text-sm',
                activity.status === 'success' && 'text-green-400',
                activity.status === 'failed' && 'text-red-400',
                activity.status === 'pending' && 'text-yellow-400'
              )}
            >
              {activity.status}
            </div>
          </div>

          <hr className="border-white/10 mt-6 mb-4" />

          {/* Container for sections */}
          <motion.div
            className="space-y-4"
            variants={modalContainerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Operation */}
            {/* Funding Operation - Special Display */}
            {activity.type === 'funding' && (
              <>
                <motion.div
                  variants={modalSectionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="space-y-3"
                >
                  <div className="text-xs text-white/60 mb-3">Funding Operation</div>
                  <motion.div
                    className="space-y-1"
                    variants={modalSectionRowsVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    <motion.div
                      className="flex justify-between text-xs"
                      variants={modalRowVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <span className="text-white/60">From</span>
                      <span className="text-white/90 font-mono">
                        Smart Account
                        {activity.fromAddress && (
                          <span className="text-white/40 text-[10px] ml-2">
                            {activity.fromAddress.slice(0, 6)}...{activity.fromAddress.slice(-4)}
                          </span>
                        )}
                      </span>
                    </motion.div>
                    <motion.div
                      className="flex justify-between text-xs"
                      variants={modalRowVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <span className="text-white/60">To</span>
                      <span className="text-white/90 font-mono">
                        Session Key
                        {activity.recipientAddress && (
                          <span className="text-white/40 text-[10px] ml-2">
                            {activity.recipientAddress.slice(0, 6)}...{activity.recipientAddress.slice(-4)}
                          </span>
                        )}
                      </span>
                    </motion.div>
                    <motion.div
                      className="flex justify-between text-xs"
                      variants={modalRowVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <span className="text-white/60">Amount</span>
                      <span className="text-white/90 font-mono">
                        {activity.fromAmount} MON
                      </span>
                    </motion.div>
                    {activity.fundingMethod && (
                      <motion.div
                        className="flex justify-between text-xs"
                        variants={modalRowVariants}
                        initial="hidden"
                        animate="visible"
                      >
                        <span className="text-white/60">Method</span>
                        <span className="text-white/90">
                          {activity.fundingMethod === 'userOp' ? 'UserOp (Paymaster)' : 'Delegation (Self-paid)'}
                        </span>
                      </motion.div>
                    )}
                  </motion.div>
                </motion.div>
                <hr className="border-white/10 my-4" />
              </>
            )}

            {/* Generic Operation - Skip for funding */}
            {activity.type !== 'funding' && (activity.fromAmount || activity.toAmount) && (
              <>
                <motion.div
                  variants={modalSectionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="space-y-3"
                >
                <div className="text-xs text-white/60 mb-3">Operation</div>
                <motion.div
                  className="space-y-1"
                  variants={modalSectionRowsVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {activity.fromAmount && activity.fromToken && (
                    <motion.div
                      className="flex justify-between text-xs"
                      variants={modalRowVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <span className="text-white/60">From</span>
                      <span className="text-white/90 font-mono">
                        {activity.fromAmount} {activity.fromToken}
                      </span>
                    </motion.div>
                  )}
                  {activity.toAmount && activity.toToken && (
                    <motion.div
                      className="flex justify-between text-xs"
                      variants={modalRowVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <span className="text-white/60">To</span>
                      <span className="text-white/90 font-mono">
                        {activity.toAmount} {activity.toToken}
                      </span>
                    </motion.div>
                  )}

                  {/* Show recipient for transfer activities */}
                  {activity.type === 'transfer' && activity.recipientAddress && (
                    <motion.div
                      className="flex justify-between items-center text-xs"
                      variants={modalRowVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <span className="text-white/60">Recipient</span>
                      <div className="flex items-center gap-1.5">
                        <code className="text-[11px] text-white/70 font-mono">
                          {shortenAddress(activity.recipientAddress, 8, 6)}
                        </code>
                        <CopyButton value={activity.recipientAddress} field="recipient" />
                        <a
                          href={`${MONAD_BLOCK_EXPLORER_URL}/address/${activity.recipientAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 hover:bg-white/5 rounded transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-blue-400 hover:text-blue-300" />
                        </a>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
                </motion.div>
                <hr className="border-white/10 my-4" />
              </>
            )}

            {/* Transaction */}
            {activity.txHash && (
              <>
                <motion.div
                  variants={modalSectionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="space-y-3"
                >
                <div className="text-xs text-white/60 mb-3">Transaction</div>
                <motion.div
                  className="space-y-1"
                  variants={modalSectionRowsVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <motion.div
                    className="flex justify-between items-center text-xs"
                    variants={modalRowVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    <span className="text-white/60">Hash</span>
                    <div className="flex items-center gap-1.5">
                      <code className="text-[11px] text-white/70 font-mono">
                        {shortenAddress(activity.txHash, 8, 6)}
                      </code>
                      <CopyButton value={activity.txHash} field="txHash" />
                      {explorerUrl && (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 hover:bg-white/5 rounded transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-blue-400 hover:text-blue-300" />
                        </a>
                      )}
                    </div>
                  </motion.div>

                  {activity.blockNumber && (
                    <motion.div
                      className="flex justify-between text-xs"
                      variants={modalRowVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <span className="text-white/60">Block</span>
                      <span className="text-white/90 font-mono">{activity.blockNumber}</span>
                    </motion.div>
                  )}

                  {activity.gasUsed && (
                    <motion.div
                      className="flex justify-between text-xs"
                      variants={modalRowVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <span className="text-white/60">Gas</span>
                      <span className="text-white/90 font-mono">{formatGas(activity.gasUsed)}</span>
                    </motion.div>
                  )}
                </motion.div>
                </motion.div>
                <hr className="border-white/10 my-4" />
              </>
            )}

            {/* Delegations */}
            {activity.delegator && (
              <motion.div
                variants={modalSectionVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-4"
              >
              <div className="text-xs text-white/60 mb-3">Delegations</div>

              {/* Account */}
              <div className="space-y-2">
                <div className="text-[11px] text-white/40 pt-3">Account</div>
                <motion.div
                  className="space-y-1"
                  variants={modalSectionRowsVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <motion.div
                    className="flex justify-between items-center text-xs"
                    variants={modalRowVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    <span className="text-white/60">Delegator</span>
                    <div className="flex items-center gap-1.5">
                      <code className="text-[11px] text-white/70 font-mono">
                        {shortenAddress(activity.delegator)}
                      </code>
                      <CopyButton value={activity.delegator} field="delegator" />
                    </div>
                  </motion.div>

                  {activity.sessionKey && (
                    <motion.div
                      className="flex justify-between items-center text-xs"
                      variants={modalRowVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <span className="text-white/60">Session Key</span>
                      <div className="flex items-center gap-1.5">
                        <code className="text-[11px] text-white/70 font-mono">
                          {shortenAddress(activity.sessionKey)}
                        </code>
                        <CopyButton value={activity.sessionKey} field="sessionKey" />
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              </div>

              {/* Details */}
              <div className="space-y-2">
                <div className="text-[11px] text-white/40 pt-3">Details</div>
                <motion.div
                  className="space-y-1"
                  variants={modalSectionRowsVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {activity.delegationCount !== undefined && (
                    <motion.div
                      className="flex justify-between text-xs"
                      variants={modalRowVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <div className="text-white/60">Count</div>
                      <div className="text-white/90 text-right font-mono">{activity.delegationCount}</div>
                    </motion.div>
                  )}
                  {activity.nonce && (
                    <motion.div
                      className="flex justify-between text-xs"
                      variants={modalRowVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <div className="text-white/60">Nonce</div>
                      <div className="text-white/90 text-right font-mono">{activity.nonce}</div>
                    </motion.div>
                  )}
                  {activity.feeEnforced !== undefined && (
                    <motion.div
                      className="flex justify-between text-xs"
                      variants={modalRowVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <div className="text-white/60">Fee</div>
                      <div
                        className={cn(
                          'text-right font-mono',
                          activity.feeEnforced ? 'text-orange-400' : 'text-green-400'
                        )}
                      >
                        {activity.feeEnforced ? '0.05%' : 'FREE'}
                      </div>
                    </motion.div>
                  )}
                  {activity.expiresAt && (
                    <motion.div
                      className="flex justify-between text-xs"
                      variants={modalRowVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <div className="text-white/60">Expires</div>
                      <div className="text-white/90 text-right">{formatRelativeTime(activity.expiresAt)}</div>
                    </motion.div>
                  )}
                </motion.div>
              </div>

              {/* Execution */}
              {activity.delegations && activity.delegations.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] text-white/40 pt-3">Execution</div>
                  <div className="space-y-3">
                    {activity.delegations.map((delegation, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.05, duration: 0.2 }}
                        className="space-y-1"
                      >
                        {/* Type */}
                        <div className="text-xs text-white/90">
                          {idx + 1}  {delegation.type}
                        </div>

                        {/* Contract */}
                        <div className="flex items-center gap-1.5">
                          <code className="text-[11px] text-white/70 font-mono">
                            {shortenAddress(delegation.target, 8, 6)}
                          </code>
                          <CopyButton value={delegation.target} field={`contract-${idx}`} />
                          <a
                            href={`${MONAD_BLOCK_EXPLORER_URL}/address/${delegation.target}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 hover:bg-white/5 rounded transition-colors"
                          >
                            <ExternalLink className="w-3 h-3 text-blue-400 hover:text-blue-300" />
                          </a>
                        </div>

                        {/* Function Selector */}
                        <code className="text-[11px] text-white/50 font-mono block">
                          {decodeFunctionName(delegation.functionSelector)} {delegation.functionSelector}
                        </code>

                        {/* Enforcers */}
                        {delegation.enforcers && delegation.enforcers.length > 0 && (
                          <div className="text-[11px] text-white/40">
                            {delegation.enforcers.map(getEnforcerName).join(' · ')}
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
              </motion.div>
            )}

          </motion.div>

          {/* Timestamp */}
          <div className="text-[11px] text-white/40 text-center pt-2 border-t border-white/10">
            {new Date(activity.timestamp).toLocaleString('en-US', {
              month: 'numeric',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
