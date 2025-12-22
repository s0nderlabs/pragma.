'use client'

import { useEffect } from 'react'
import { useThemeStore } from '@/stores/useThemeStore'

/**
 * ThemeSynchronizer Component
 *
 * Keeps the HTML data-theme attribute aligned with the canonical theme.
 * next-themes owns the .dark class; this only drives Liquid Glass CSS variables.
 */
export function ThemeSynchronizer() {
  const { theme, isReady } = useThemeStore()

  useEffect(() => {
    if (!isReady) return
    document.documentElement.setAttribute('data-theme', theme)
  }, [isReady, theme])

  // This component renders nothing - it only manages theme synchronization
  return null
}
