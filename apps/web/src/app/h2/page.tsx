'use client'

import { useEffect } from 'react'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import Background from '@/components/h2/Background'

export default function H2Page() {
  useEffect(() => {
    // Override body background for this page
    const originalBg = document.body.style.background
    document.body.style.background = 'transparent'

    return () => {
      document.body.style.background = originalBg
    }
  }, [])

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{
        color: '#1A1A1A'
      }}
      data-theme="light"
    >
      <Background />

      {/* Main Content with Liquid Glass */}
      <div className="absolute inset-0 flex items-center justify-center z-20">
        <LiquidGlassPanel
          theme="light"
          className="rounded-[32px]"
          style={{ width: '896px', height: '600px' }}
          stdDeviation={0.04}
          displacementScale={0.5}
          blurAmount={8}
        >
          <div className="flex items-center justify-center h-full p-12">
            <div className="text-center">
              <h1 className="text-5xl font-bold mb-4" style={{ color: 'var(--liquid-glass-content)' }}>
                Liquid Glass
              </h1>
              <p className="text-xl" style={{ color: 'var(--liquid-glass-content)' }}>
                Simple frosted glass with iridescent background
              </p>
            </div>
          </div>
        </LiquidGlassPanel>
      </div>
    </div>
  )
}
