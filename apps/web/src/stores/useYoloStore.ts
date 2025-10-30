'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface YoloState {
  enabled: boolean
  toggle: () => void
  setEnabled: (enabled: boolean) => void
}

/**
 * Yolo Mode Store
 *
 * Manages "Yolo mode" (quick mode) - skips confirmation, executes immediately.
 * Normal: User input → AI plan → Quote → Confirmation → Execute
 * Yolo: User input → AI plan + execute immediately (no confirmation)
 */
export const useYoloStore = create<YoloState>()(
  persist(
    (set) => ({
      enabled: false,
      toggle: () => set((state) => ({ enabled: !state.enabled })),
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: 'pragma:yolo',
    }
  )
)
