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
  // Deployment notification states
  isDeploying: boolean // Show "deploying..." spinner
  showDeployNotification: boolean // Show "deployed successfully"

  // Actions
  toggle: () => void
  setMobileOpen: (open: boolean) => void
  setActiveSection: (section: SidebarSection) => void
  toggleBalance: () => void
  setIsDeploying: (deploying: boolean) => void
  setShowDeployNotification: (show: boolean) => void
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isOpen: true,  // Start expanded on desktop
      isMobileOpen: false,  // Start closed on mobile
      activeSection: null,  // All accordion sections collapsed initially
      balanceVisible: true,  // Start with balance visible
      isDeploying: false,  // Hidden by default
      showDeployNotification: false,  // Hidden by default

      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
      setMobileOpen: (open) => set({ isMobileOpen: open }),
      setActiveSection: (section) =>
        set((state) => ({
          activeSection: state.activeSection === section ? null : section
        })),
      toggleBalance: () => set((state) => ({ balanceVisible: !state.balanceVisible })),
      setIsDeploying: (deploying) => set({ isDeploying: deploying }),
      setShowDeployNotification: (show) => set({ showDeployNotification: show }),
    }),
    {
      name: 'sidebar-storage',
      partialize: (state) => ({ isOpen: state.isOpen }), // Only persist isOpen
    }
  )
)
