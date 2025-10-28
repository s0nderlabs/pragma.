'use client'

import { useEffect, useState } from 'react'
import LiquidGlass from 'liquid-glass-react'
import Background from '@/components/h2/Background'

export default function H2Page() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="relative min-h-screen overflow-hidden">
      <Background />

      {mounted && (
        <div
          className="absolute inset-0"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <LiquidGlass
            mode="shader"
            displacementScale={100}
            blurAmount={0.5}
            saturation={140}
            aberrationIntensity={2}
            elasticity={0}
            cornerRadius={32}
            overLight={false}
          >
            <div
              style={{ width: '896px', height: '600px' }}
              className="flex items-center justify-center p-12"
            >
              <h1 className="text-4xl font-bold text-[#1A1A1A] dark:text-[#F8F8FF]">
                Glass Box Center
              </h1>
            </div>
          </LiquidGlass>
        </div>
      )}
    </div>
  )
}
