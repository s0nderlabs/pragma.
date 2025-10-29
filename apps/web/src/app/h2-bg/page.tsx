'use client'

import { useEffect } from 'react'
import ColorBends from '@/components/ColorBends'

export default function H2BgTestPage() {
  useEffect(() => {
    // Override body background for this page
    const originalBg = document.body.style.background
    document.body.style.background = '#000000'

    return () => {
      document.body.style.background = originalBg
    }
  }, [])

  return (
    <div className="fixed inset-0 w-full h-full bg-black">
      <ColorBends
        colors={["#ff5c7a", "#8a5cff", "#00ffd1"]}
        rotation={30}
        speed={0.3}
        scale={0.3}
        frequency={1.4}
        warpStrength={1.2}
        mouseInfluence={0.8}
        parallax={0.6}
        noise={0.08}
        transparent={false}
      />
    </div>
  )
}
