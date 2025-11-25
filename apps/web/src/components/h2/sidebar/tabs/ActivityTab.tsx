'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Layers } from 'lucide-react'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { useActivityStore } from '@/stores/useActivityStore'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { ActivityDetailModal } from '../ActivityDetailModal'
import {
  extractActivityRecords,
  getRelativeTime,
  type ActivityRecord,
  EXECUTION_TOOLS,
} from '@/lib/h2/activityExtractor'
import {
  activityCardVariants,
  getStaggeredTransition,
  springTransition,
  staggerDelays,
  disabledTransition,
} from '@/lib/h2/motionVariants'
import {
  SwapIcon,
  TransferIcon,
  WrapIcon,
  UnwrapIcon,
  StakeIcon,
  UnstakeIcon,
  UnstakeClaimIcon,
  FundingIcon,
  WithdrawalIcon,
} from '../../icons/ActivityIcons'

/**
 * ActivityTab - Real Transaction History from H2 Tool Executions
 *
 * Shows all executed transactions (swaps, transfers, stakes, etc.)
 * Automatically updates when new transactions complete
 * Persists per-user in localStorage via useActivityStore
 */
export function ActivityTab() {
  const messages = useH2ChatStore((state) => state.messages)
  const sessionData = useH2ChatStore((state) => state.sessionData)
  const wallet = sessionData?.delegator?.toLowerCase() || ''

  // Select raw data directly for stable reference
  const activitiesByWallet = useActivityStore((state) => state.activitiesByWallet)
  const addActivity = useActivityStore((state) => state.addActivity)

  // Get activities for current wallet with useMemo for stable reference
  const activities = useMemo(() => {
    return activitiesByWallet[wallet] || []
  }, [wallet, activitiesByWallet])

  // Check if any execution tools are currently running
  const hasRunningTools = useMemo(
    () =>
      messages.some((msg) => {
        if (msg.role !== 'tool') return false
        if (!EXECUTION_TOOLS.includes(msg.toolName as (typeof EXECUTION_TOOLS)[number])) return false

        const toolMsg = msg

        // If parent, check if any children are running
        if (toolMsg.isParent && Array.isArray(toolMsg.children)) {
          return toolMsg.children.some((child) => child.status === 'running')
        }

        // Otherwise check standalone tool status
        return toolMsg.status === 'running'
      }),
    [messages]
  )

  // Modal state
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecord | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Accessibility: Detect reduced motion preference
  const prefersReducedMotion = usePrefersReducedMotion()

  const handleActivityClick = (activity: ActivityRecord) => {
    setSelectedActivity(activity)
    setModalOpen(true)
  }

  // Sync new completed tools to ActivityStore
  useEffect(() => {
    if (!wallet || hasRunningTools) return

    const newActivities = extractActivityRecords(messages)

    // Upsert all activities - store handles deduplication and change detection
    newActivities.forEach((activity) => {
      addActivity(activity, wallet)
    })
  }, [messages, wallet, hasRunningTools, addActivity])

  const getIcon = (type: ActivityRecord['type']) => {
    switch (type) {
      case 'swap':
        return <SwapIcon className="w-7 h-7" />
      case 'transfer':
        return <TransferIcon className="w-7 h-7" />
      case 'wrap':
        return <WrapIcon className="w-7 h-7" />
      case 'unwrap':
        return <UnwrapIcon className="w-7 h-7" />
      case 'stake':
        return <StakeIcon className="w-7 h-7" />
      case 'unstake':
        return <UnstakeIcon className="w-7 h-7" />
      case 'unstakeClaim':
        return <UnstakeClaimIcon className="w-7 h-7" />
      case 'funding':
        return <FundingIcon className="w-7 h-7" />
      case 'withdrawal':
        return <WithdrawalIcon className="w-7 h-7" />
      default:
        return null
    }
  }

  const getStatusColor = (status: ActivityRecord['status']) => {
    switch (status) {
      case 'success':
        return 'text-green-400'
      case 'pending':
        return 'text-yellow-400'
      case 'failed':
        return 'text-red-400'
      default:
        return 'text-white/40'
    }
  }

  const getTypeName = (type: ActivityRecord['type']): string => {
    switch (type) {
      case 'swap':
        return 'Swap'
      case 'transfer':
        return 'Transfer'
      case 'wrap':
        return 'Wrap'
      case 'unwrap':
        return 'Unwrap'
      case 'stake':
        return 'Stake'
      case 'unstake':
        return 'Unstake Request'
      case 'unstakeClaim':
        return 'Unstake Claim'
      case 'funding':
        return 'Fund'
      case 'withdrawal':
        return 'Withdraw'
      default:
        return type
    }
  }

  // Empty state
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <Layers className="w-8 h-8 text-white/40" />
        </div>
        <div className="text-sm font-medium text-white/60 mb-1">
          No transactions yet
        </div>
        <div className="text-xs text-white/40 max-w-[200px]">
          Execute a swap or transfer to see your activity here
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-0 will-change-scroll">
        {activities.map((activity, index) => {
            const isLast = index === activities.length - 1
            return (
              <motion.div
                key={activity.id}
                variants={activityCardVariants}
                initial="initial"
                animate="animate"
                transition={
                  prefersReducedMotion
                    ? disabledTransition
                    : getStaggeredTransition('medium', index, staggerDelays.activityCard)
                }
                className={cn(
                  'py-4 -mx-4 px-4',
                  'rounded-3xl',
                  'transition-colors duration-200',
                  'hover:bg-white/[0.02]',
                  'cursor-pointer'
                )}
                onClick={() => handleActivityClick(activity)}
              >
            <div className="flex items-start justify-between gap-3">
              {/* Left: Icon and Details */}
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0 text-white/60">
                  {getIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  {/* Display Text with Amounts */}
                  <div className="text-sm font-medium text-white mb-0.5">
                    {activity.displayText || getTypeName(activity.type)}
                  </div>

                  {/* Original Description (fallback) */}
                  {!activity.displayText && (
                    <div className="text-xs text-white/60 mb-1.5 truncate">
                      {activity.description}
                    </div>
                  )}

                  {/* Timestamp only */}
                  <div className="text-xs text-white/40">
                    {getRelativeTime(activity.timestamp)}
                  </div>
                </div>
              </div>

              {/* Right: Status (only show non-success states) */}
              {activity.status !== 'success' && (
                <div className="flex-shrink-0 text-right">
                  <div
                    className={cn(
                      'text-xs font-medium capitalize',
                      getStatusColor(activity.status)
                    )}
                  >
                    {activity.status === 'pending' && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        {activity.status}
                      </span>
                    )}
                    {activity.status === 'failed' && (
                      <span className="flex items-center gap-1.5">
                        ✗ {activity.status}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
            )
          })}
      </div>

      {/* Activity Detail Modal */}
      <ActivityDetailModal
        activity={selectedActivity}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  )
}
