import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SidebarSection = 'history' | 'receipts' | 'settings' | null

interface SidebarState {
  // Desktop: sidebar collapsed/expanded
  isOpen: boolean
  // Mobile: overlay open/closed
  isMobileOpen: boolean
  // Which accordion section is active
  activeSection: SidebarSection
  // Balance visibility (show/hide with asterisks)
  balanceVisible: boolean

  // Actions
  toggle: () => void
  setMobileOpen: (open: boolean) => void
  setActiveSection: (section: SidebarSection) => void
  toggleBalance: () => void
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isOpen: true,  // Start expanded on desktop
      isMobileOpen: false,  // Start closed on mobile
      activeSection: null,  // All accordion sections collapsed initially
      balanceVisible: true,  // Start with balance visible

      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
      setMobileOpen: (open) => set({ isMobileOpen: open }),
      setActiveSection: (section) =>
        set((state) => ({
          activeSection: state.activeSection === section ? null : section
        })),
      toggleBalance: () => set((state) => ({ balanceVisible: !state.balanceVisible })),
    }),
    {
      name: 'sidebar-storage',
      partialize: (state) => ({ isOpen: state.isOpen }), // Only persist isOpen
    }
  )
)
