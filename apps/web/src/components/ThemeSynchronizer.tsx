'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { useThemeStore } from '@/stores/useThemeStore'

/**
 * ThemeSynchronizer Component
 *
 * Syncs theme changes from useThemeStore (toggle button) to next-themes.
 *
 * Architecture:
 * - Most components read theme from next-themes via useTheme() hook
 * - Toggle button in ToolsTab writes to useThemeStore (Zustand)
 * - This component syncs Zustand → Next Themes
 *
 * Applies:
 * - .dark class (via next-themes for Tailwind dark: utilities)
 * - data-theme attribute (for Liquid Glass CSS variables)
 *
 * IMPORTANT: Waits for Zustand persist hydration to prevent overwriting saved theme
 */
export function ThemeSynchronizer() {
  const { theme: pragmaTheme } = useThemeStore()
  const { setTheme: setNextTheme } = useTheme()
  const [zustandHydrated, setZustandHydrated] = useState(false)

  // Wait for Zustand persist to actually load from localStorage
  useEffect(() => {
    // Subscribe to Zustand store hydration
    const unsubHydrate = useThemeStore.persist.onHydrate(() => {
      // Called when hydration starts - do nothing yet
    })

    const unsubFinishHydrate = useThemeStore.persist.onFinishHydration(() => {
      // Called when localStorage value is loaded into store
      setZustandHydrated(true)
    })

    // Check if already hydrated (in case we mounted after hydration)
    if (useThemeStore.persist.hasHydrated()) {
      setZustandHydrated(true)
    }

    return () => {
      unsubHydrate()
      unsubFinishHydrate()
    }
  }, [])

  useEffect(() => {
    // Don't sync until Zustand has ACTUALLY hydrated from localStorage
    if (!zustandHydrated) return

    const html = document.documentElement

    // Convert pragma-dark/pragma-light to dark/light for next-themes
    const nextThemeValue = pragmaTheme === 'pragma-dark' ? 'dark' : 'light'

    // Sync with next-themes (this will apply .dark class automatically)
    setNextTheme(nextThemeValue)

    // Apply data-theme attribute for Liquid Glass
    html.setAttribute('data-theme', pragmaTheme)
  }, [zustandHydrated, pragmaTheme, setNextTheme])

  // This component renders nothing - it only manages theme synchronization
  return null
}
