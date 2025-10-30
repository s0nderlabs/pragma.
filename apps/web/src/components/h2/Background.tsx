'use client'

import { useThemeStore } from '@/stores/useThemeStore'

export default function Background() {
  const { theme } = useThemeStore()

  // Static gradient using soft lavender tones - no animation
  const gradientStyle = theme === 'pragma-light'
    ? {
        background: 'radial-gradient(ellipse at 50% 40%, #E8E5F5 0%, #F2F0F9 100%)',
      }
    : {
        // Deep lavender dark mode with purple undertones
        background: 'radial-gradient(ellipse at 50% 40%, #2B243D 0%, #1C1628 100%)',
      }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 w-full h-full"
      style={gradientStyle}
    />
  )
}
