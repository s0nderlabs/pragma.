'use client'

import { useEffect, useRef } from 'react'
import { useThemeStore } from '@/stores/useThemeStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import type { ChatMessage } from '@/lib/h2/types'
import gsap from 'gsap'

interface UserMessageProps {
  message: ChatMessage
}

/**
 * UserMessage Component
 *
 * User messages appear as glass bubbles, right-aligned.
 * Design: Compact glass bubble with slide-in animation from right.
 */
export function UserMessage({ message }: UserMessageProps) {
  const { theme } = useThemeStore()
  const messageRef = useRef<HTMLDivElement>(null)

  // Slide-in animation on mount
  useEffect(() => {
    if (!messageRef.current) return

    gsap.fromTo(
      messageRef.current,
      {
        x: 50,
        opacity: 0,
      },
      {
        x: 0,
        opacity: 1,
        duration: 0.4,
        ease: 'power2.out',
      }
    )
  }, [])

  return (
    <div ref={messageRef} className="flex justify-end mb-4">
      <div className="max-w-[80%] lg:max-w-[60%]">
        <LiquidGlassPanel
          theme={theme}
          className="rounded-[24px] px-5 py-3 relative overflow-hidden"
          blurAmount={6}
          displacementScale={0.3}
          stdDeviation={0.03}
        >
          {/* Purple tint overlay */}
          <div
            className="absolute inset-0 rounded-[24px] pointer-events-none"
            style={{
              background: 'color-mix(in srgb, rgb(168, 85, 247) 15%, transparent)',
            }}
          />

          <p className="text-sm lg:text-base whitespace-pre-wrap break-words relative z-10">
            {message.content}
          </p>
        </LiquidGlassPanel>
      </div>
    </div>
  )
}
