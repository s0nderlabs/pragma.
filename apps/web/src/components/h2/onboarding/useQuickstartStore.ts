import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface QuickstartState {
  // Modal state
  isOpen: boolean
  currentStep: number
  hasAgreed: boolean

  // Persistence flag (stored in localStorage)
  hasCompleted: boolean

  // Actions
  openModal: () => void
  closeModal: () => void
  nextStep: () => void
  prevStep: () => void
  goToStep: (step: number) => void
  setAgreed: (agreed: boolean) => void
  complete: () => void
  reset: () => void // For testing/development
}

const TOTAL_STEPS = 5

export const useQuickstartStore = create<QuickstartState>()(
  persist(
    (set, get) => ({
      // Initial state
      isOpen: false,
      currentStep: 0,
      hasAgreed: false,
      hasCompleted: false,

      // Open modal (only if not completed)
      openModal: () => {
        if (!get().hasCompleted) {
          set({ isOpen: true, currentStep: 0, hasAgreed: false })
        }
      },

      // Close modal (only allowed after completion)
      closeModal: () => {
        if (get().hasCompleted) {
          set({ isOpen: false })
        }
      },

      // Navigate to next step
      nextStep: () => {
        const { currentStep } = get()
        if (currentStep < TOTAL_STEPS - 1) {
          set({ currentStep: currentStep + 1 })
        }
      },

      // Navigate to previous step
      prevStep: () => {
        const { currentStep } = get()
        if (currentStep > 0) {
          set({ currentStep: currentStep - 1 })
        }
      },

      // Jump to specific step
      goToStep: (step: number) => {
        if (step >= 0 && step < TOTAL_STEPS) {
          set({ currentStep: step })
        }
      },

      // Toggle agreement checkbox
      setAgreed: (agreed: boolean) => {
        set({ hasAgreed: agreed })
      },

      // Complete the quickstart (user agreed and clicked Get Started)
      complete: () => {
        const { hasAgreed, currentStep } = get()
        // Only complete if on last step and agreed
        if (hasAgreed && currentStep === TOTAL_STEPS - 1) {
          set({ hasCompleted: true, isOpen: false })
        }
      },

      // Reset for testing/development
      reset: () => {
        set({
          isOpen: false,
          currentStep: 0,
          hasAgreed: false,
          hasCompleted: false
        })
      },
    }),
    {
      name: 'pragma_quickstart_v1',
      // Only persist hasCompleted flag
      partialize: (state) => ({ hasCompleted: state.hasCompleted }),
    }
  )
)

// Hook to auto-open modal on first visit
export function useAutoOpenQuickstart() {
  const { isOpen, hasCompleted, openModal } = useQuickstartStore()

  // Return function to check and open
  const checkAndOpen = () => {
    if (!hasCompleted && !isOpen) {
      openModal()
    }
  }

  return { checkAndOpen, hasCompleted }
}
