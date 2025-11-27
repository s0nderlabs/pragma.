import { create } from 'zustand'

interface NotificationState {
  showCopy: boolean
  showCopyNotification: () => void
  // Error notification state
  errorMessage: string | null
  showErrorNotification: (message: string) => void
  hideErrorNotification: () => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  showCopy: false,
  showCopyNotification: () => {
    set({ showCopy: true })
    // Auto-hide after 2 seconds
    setTimeout(() => {
      set({ showCopy: false })
    }, 2000)
  },
  // Error notification
  errorMessage: null,
  showErrorNotification: (message: string) => {
    set({ errorMessage: message })
    // Auto-hide after 3 seconds
    setTimeout(() => {
      set({ errorMessage: null })
    }, 3000)
  },
  hideErrorNotification: () => {
    set({ errorMessage: null })
  },
}))
