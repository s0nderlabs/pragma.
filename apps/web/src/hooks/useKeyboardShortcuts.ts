/**
 * useKeyboardShortcuts - Centralized keyboard shortcut management
 *
 * Provides a declarative way to register keyboard shortcuts with support for:
 * - Modifier keys (Alt, Cmd, Ctrl, Shift)
 * - Input focus detection (skip shortcuts when typing)
 * - Platform awareness (macOS vs Windows/Linux)
 * - Enable/disable shortcuts dynamically
 *
 * Usage:
 * ```tsx
 * useKeyboardShortcuts({
 *   shortcuts: [
 *     {
 *       key: '\\',
 *       modifiers: ['alt'],
 *       handler: () => toggleSidebar(),
 *       label: 'Toggle sidebar',
 *       skipIfInputFocused: true
 *     }
 *   ]
 * })
 * ```
 */

import { useEffect } from 'react'

export type ModifierKey = 'alt' | 'cmd' | 'ctrl' | 'shift' | 'meta'

export interface KeyboardShortcut {
  /** The key to listen for (e.g., '\\', 'a', 'Enter', 'ArrowLeft') */
  key: string

  /** Modifier keys required (Alt, Cmd, Ctrl, Shift) */
  modifiers?: ModifierKey[]

  /** Handler function to execute when shortcut is triggered */
  handler: () => void

  /** Human-readable label for the shortcut (for hints/help) */
  label: string

  /** Enable/disable this specific shortcut */
  enabled?: boolean

  /** Skip this shortcut if user is typing in an input/textarea */
  skipIfInputFocused?: boolean
}

export interface UseKeyboardShortcutsOptions {
  /** Array of shortcuts to register */
  shortcuts: KeyboardShortcut[]

  /** Disable all shortcuts (useful for modals, overlays) */
  disabled?: boolean
}

/**
 * Check if the current focus is in an input element
 */
function isInputFocused(): boolean {
  const activeElement = document.activeElement
  if (!activeElement) return false

  const tagName = activeElement.tagName.toLowerCase()
  const isInput = tagName === 'input' || tagName === 'textarea'
  const isContentEditable = activeElement.getAttribute('contenteditable') === 'true'

  return isInput || isContentEditable
}

/**
 * Check if the event matches the required modifiers EXACTLY
 */
function matchesModifiers(event: KeyboardEvent, modifiers: ModifierKey[] = []): boolean {
  const needsAlt = modifiers.includes('alt')
  const needsMeta = modifiers.includes('meta') || modifiers.includes('cmd')
  const needsCtrl = modifiers.includes('ctrl')
  const needsShift = modifiers.includes('shift')

  // EXACT match - all modifier states must match exactly
  // If Alt is required, altKey must be true. If not required, altKey must be false.
  if (event.altKey !== needsAlt) return false
  if (event.metaKey !== needsMeta) return false
  if (event.ctrlKey !== needsCtrl) return false
  if (event.shiftKey !== needsShift) return false

  return true
}

/**
 * Register keyboard shortcuts
 */
export function useKeyboardShortcuts({ shortcuts, disabled = false }: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    if (disabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Find matching shortcut
      for (const shortcut of shortcuts) {
        const { key, modifiers, handler, enabled, skipIfInputFocused } = shortcut

        // Skip if shortcut is disabled
        if (enabled === false) continue

        // Skip if user is typing in input and shortcut requests it
        if (skipIfInputFocused && isInputFocused()) continue

        // Check if key matches
        if (event.key !== key) continue

        // Check if modifiers match
        if (!matchesModifiers(event, modifiers)) continue

        // All conditions met - execute handler
        event.preventDefault()
        event.stopPropagation()
        handler()

        // Stop checking other shortcuts
        break
      }
    }

    // Register global keyboard listener
    window.addEventListener('keydown', handleKeyDown)

    // Cleanup on unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [shortcuts, disabled])
}
