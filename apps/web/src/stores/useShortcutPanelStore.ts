import { create } from 'zustand'

interface ShortcutPanelState {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
}

export const useShortcutPanelStore = create<ShortcutPanelState>()((set) => ({
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
