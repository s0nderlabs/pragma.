import { create } from 'zustand'

interface NotificationState {
  showCopy: boolean
  showCopyNotification: () => void
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
}))
