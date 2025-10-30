'use client'

import Iridescence from '@/components/Iridescence'
import { useThemeStore } from '@/stores/useThemeStore'

export default function Background() {
  const { theme } = useThemeStore()

  // Theme-specific color configurations
  const config = theme === 'pragma-light'
    ? {
        color: [0.75, 0.82, 0.92] as [number, number, number], // Bright soft purple-blue
        speed: 0.8,
        amplitude: 0.12,
      }
    : {
        color: [0.35, 0.45, 0.75] as [number, number, number], // Deep purple-blue
        speed: 1.0,
        amplitude: 0.1,
      }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 w-full h-full">
      <Iridescence
        color={config.color}
        speed={config.speed}
        amplitude={config.amplitude}
        mouseReact={true}
      />
    </div>
  )
}
