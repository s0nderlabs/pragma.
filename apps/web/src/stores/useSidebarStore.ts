import { create } from 'zustand'

export type SidebarSection = 'history' | 'receipts' | 'settings' | null

interface SidebarState {
  // Desktop: sidebar collapsed/expanded
  isOpen: boolean
  // Mobile: overlay open/closed
  isMobileOpen: boolean
  // Which accordion section is active
  activeSection: SidebarSection

  // Actions
  toggle: () => void
  setMobileOpen: (open: boolean) => void
  setActiveSection: (section: SidebarSection) => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: true,  // Start expanded on desktop
  isMobileOpen: false,  // Start closed on mobile
  activeSection: null,  // All accordion sections collapsed

  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setMobileOpen: (open) => set({ isMobileOpen: open }),
  setActiveSection: (section) =>
    set((state) => ({
      activeSection: state.activeSection === section ? null : section
    })),
}))
