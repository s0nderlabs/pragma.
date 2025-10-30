'use client'

import { useThemeStore } from '@/stores/useThemeStore'

export default function Background() {
  const { theme } = useThemeStore()

  // Static gradient using Monad brand colors - no animation
  const gradientStyle = theme === 'pragma-light'
    ? {
        background: 'radial-gradient(ellipse at 50% 40%, #F5F3FF 0%, #FBFAF9 100%)',
      }
    : {
        // Much more subtle dark mode - almost black with gentle purple hint
        background: 'radial-gradient(ellipse at 50% 40%, #1a1028 0%, #0E100F 100%)',
      }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 w-full h-full"
      style={gradientStyle}
    />
  )
}
