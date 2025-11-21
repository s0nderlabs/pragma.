import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ActivityRecord } from '@/lib/h2/activityExtractor'

interface ActivityState {
  // Activities mapped by wallet address (per-user)
  activitiesByWallet: Record<string, ActivityRecord[]>

  // Add new activity
  addActivity: (activity: ActivityRecord, walletAddress: string) => void

  // Clear old activities (>100 or >30 days)
  clearOld: (walletAddress: string) => void

  // Clear all activities for a wallet
  clearWallet: (walletAddress: string) => void
}

const MAX_ACTIVITIES = 100
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export const useActivityStore = create<ActivityState>()(
  persist(
    (set, get) => ({
      activitiesByWallet: {},

      addActivity: (activity, walletAddress) => {
        const wallet = walletAddress.toLowerCase()

        set((state) => {
          const existingActivities = state.activitiesByWallet[wallet] || []

          // Find existing activity by ID (same ToolMessage)
          const existingIndex = existingActivities.findIndex((a) => a.id === activity.id)

          if (existingIndex !== -1) {
            const existing = existingActivities[existingIndex]

            // Change detection - only update if data actually changed
            const hasChanged =
              existing.status !== activity.status ||
              existing.txHash !== activity.txHash ||
              existing.toAmount !== activity.toAmount ||
              existing.displayText !== activity.displayText ||
              existing.blockNumber !== activity.blockNumber ||
              existing.gasUsed !== activity.gasUsed

            if (!hasChanged) {
              return state // No change - prevent re-render
            }

            // Update existing activity (preserve original timestamp)
            const updatedActivities = [...existingActivities]
            updatedActivities[existingIndex] = {
              ...activity,
              timestamp: existing.timestamp, // Keep original for sorting
            }

            return {
              activitiesByWallet: {
                ...state.activitiesByWallet,
                [wallet]: updatedActivities,
              },
            }
          }

          // New activity - check for duplicate txHash (cross-session)
          if (activity.txHash) {
            const isDuplicateTx = existingActivities.some((a) => a.txHash === activity.txHash)
            if (isDuplicateTx) {
              return state // Don't add duplicate transactions
            }
          }

          // Add new activity (newest first)
          const updatedActivities = [activity, ...existingActivities].slice(0, MAX_ACTIVITIES)

          return {
            activitiesByWallet: {
              ...state.activitiesByWallet,
              [wallet]: updatedActivities,
            },
          }
        })
      },

      clearOld: (walletAddress) => {
        const wallet = walletAddress.toLowerCase()
        const now = Date.now()

        set((state) => {
          const activities = state.activitiesByWallet[wallet] || []

          const filtered = activities.filter(
            (a) => now - a.timestamp < MAX_AGE_MS
          )

          return {
            activitiesByWallet: {
              ...state.activitiesByWallet,
              [wallet]: filtered,
            },
          }
        })
      },

      clearWallet: (walletAddress) => {
        const wallet = walletAddress.toLowerCase()

        set((state) => {
          const { [wallet]: _, ...rest } = state.activitiesByWallet
          return { activitiesByWallet: rest }
        })
      },
    }),
    {
      name: 'pragma-activities',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
