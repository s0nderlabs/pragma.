'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'

/**
 * LoadingAnimation Component
 *
 * Claude Code style AI thinking animation.
 * Design: Glow pulse effect with breathing animation.
 */
export function LoadingAnimation() {
  const dotsRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dotsRef.current || !glowRef.current) return

    // Pulsing glow animation
    const glowTl = gsap.timeline({ repeat: -1 })
    glowTl.to(glowRef.current, {
      scale: 1.2,
      opacity: 0.6,
      duration: 1.5,
      ease: 'sine.inOut',
    })
    glowTl.to(glowRef.current, {
      scale: 1,
      opacity: 0.3,
      duration: 1.5,
      ease: 'sine.inOut',
    })

    // Dots animation (sequential fade)
    const dots = dotsRef.current.children
    const dotsTl = gsap.timeline({ repeat: -1 })

    Array.from(dots).forEach((dot, i) => {
      dotsTl.to(
        dot,
        {
          opacity: 1,
          duration: 0.3,
          ease: 'power2.in',
        },
        i * 0.2
      )
    })

    dotsTl.to(dots, {
      opacity: 0.3,
      duration: 0.3,
      stagger: 0.1,
    })

    return () => {
      glowTl.kill()
      dotsTl.kill()
    }
  }, [])

  return (
    <div className="mb-4 flex items-center">
      <div className="relative">
        {/* Glow effect */}
        <div
          ref={glowRef}
          className="absolute inset-0 rounded-full blur-xl opacity-30"
          style={{
            background: 'radial-gradient(circle, var(--liquid-glass-color) 0%, transparent 70%)',
          }}
        />

        {/* Dots */}
        <div ref={dotsRef} className="relative flex items-center gap-1.5 px-4 py-2">
          <div className="w-2 h-2 rounded-full bg-current opacity-30" />
          <div className="w-2 h-2 rounded-full bg-current opacity-30" />
          <div className="w-2 h-2 rounded-full bg-current opacity-30" />
        </div>
      </div>
    </div>
  )
}
