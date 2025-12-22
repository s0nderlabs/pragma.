'use client'

import { useCallback } from 'react'
import { useTheme } from 'next-themes'

export type Theme = 'pragma-light' | 'pragma-dark'

interface ThemeState {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  isReady: boolean
}

export const useThemeStore = (): ThemeState => {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const isReady = resolvedTheme !== undefined

  const normalizedTheme: Theme =
    theme === 'dark'
      ? 'pragma-dark'
      : theme === 'light'
        ? 'pragma-light'
        : resolvedTheme === 'dark'
        ? 'pragma-dark'
        : 'pragma-light'

  const setPragmaTheme = useCallback(
    (nextTheme: Theme) => {
      setTheme(nextTheme === 'pragma-dark' ? 'dark' : 'light')
    },
    [setTheme]
  )

  const toggleTheme = useCallback(() => {
    setTheme(normalizedTheme === 'pragma-dark' ? 'light' : 'dark')
  }, [normalizedTheme, setTheme])

  return { theme: normalizedTheme, toggleTheme, setTheme: setPragmaTheme, isReady }
}
