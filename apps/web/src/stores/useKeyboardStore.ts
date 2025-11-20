/**
 * useKeyboardStore - Keyboard shortcuts state management
 *
 * Manages:
 * - Keyboard help modal visibility
 * - Global shortcut enable/disable
 * - Individual shortcut states
 */

import { create } from 'zustand'

interface KeyboardState {
  /** Show/hide keyboard help modal */
  showHelpModal: boolean

  /** Globally disable all shortcuts (useful for modals) */
  shortcutsEnabled: boolean

  /** Individual shortcut enable states */
  shortcuts: {
    sidebarToggle: boolean
    tabNavigation: boolean
    quickMode: boolean
    themeToggle: boolean
    settingsTab: boolean
    activityTab: boolean
    sessionsTab: boolean
  }

  // Actions
  openHelpModal: () => void
  closeHelpModal: () => void
  toggleHelpModal: () => void

  enableAllShortcuts: () => void
  disableAllShortcuts: () => void

  enableShortcut: (key: keyof KeyboardState['shortcuts']) => void
  disableShortcut: (key: keyof KeyboardState['shortcuts']) => void
}

export const useKeyboardStore = create<KeyboardState>((set) => ({
  // Initial state
  showHelpModal: false,
  shortcutsEnabled: true,

  shortcuts: {
    sidebarToggle: true,
    tabNavigation: true,
    quickMode: true,
    themeToggle: true,
    settingsTab: true,
    activityTab: true,
    sessionsTab: true,
  },

  // Help modal actions
  openHelpModal: () => set({ showHelpModal: true }),
  closeHelpModal: () => set({ showHelpModal: false }),
  toggleHelpModal: () => set((state) => ({ showHelpModal: !state.showHelpModal })),

  // Global shortcut actions
  enableAllShortcuts: () => set({ shortcutsEnabled: true }),
  disableAllShortcuts: () => set({ shortcutsEnabled: false }),

  // Individual shortcut actions
  enableShortcut: (key) =>
    set((state) => ({
      shortcuts: {
        ...state.shortcuts,
        [key]: true,
      },
    })),

  disableShortcut: (key) =>
    set((state) => ({
      shortcuts: {
        ...state.shortcuts,
        [key]: false,
      },
    })),
}))
