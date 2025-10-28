'use client'

import { useEffect, useState } from 'react'
import GlassSurface from '@/components/GlassSurface'
import Background from '@/components/h2/Background'

export default function H2TestPage() {
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
          <GlassSurface
            width={896}
            height={600}
            borderRadius={32}
            blur={11}
            saturation={1.4}
            distortionScale={100}
            redOffset={0}
            greenOffset={5}
            blueOffset={10}
            opacity={0.95}
            borderWidth={1.5}
          >
            <div
              style={{ width: '896px', height: '600px' }}
              className="flex items-center justify-center p-12"
            >
              <h1 className="text-4xl font-bold text-[#1A1A1A] dark:text-[#F8F8FF]">
                Glass Box Center
              </h1>
            </div>
          </GlassSurface>
        </div>
      )}
    </div>
  )
}
