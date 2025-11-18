'use client'

import { useThemeStore } from '@/stores/useThemeStore'

export default function Background() {
  const { theme } = useThemeStore()

  // Solid grayscale background for clean, professional aesthetic
  const gradientStyle = theme === 'pragma-light'
    ? {
        background: '#FFFFFF',
      }
    : {
        // Dark mode - near black
        background: '#1A1A1A',
      }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 w-full h-full"
      style={gradientStyle}
    />
  )
}
