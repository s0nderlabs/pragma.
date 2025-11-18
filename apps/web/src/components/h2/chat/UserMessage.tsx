'use client'

import { useEffect, useRef } from 'react'
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
        <div
          className="rounded-[24px] px-5 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        >
          <p className="text-sm lg:text-base whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
      </div>
    </div>
  )
}
