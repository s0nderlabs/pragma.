'use client'

import { useState, useEffect, type ReactNode } from 'react'

const NICKNAMES = ['degen', 'anon', 'fren', 'ser', 'chad', 'based one']

function getGreeting(nickname: string): { emoji: string; text: string } {
  const now = new Date()
  const hour = now.getHours()
  const day = now.getDay() // 0 = Sunday, 5 = Friday, 6 = Saturday

  // Special day greetings (higher priority)
  if (day === 5) return { emoji: '🎉', text: `Happy Friday, ${nickname}` }
  if (day === 6) return { emoji: '🌴', text: `Weekend vibes, ${nickname}` }
  if (day === 0) return { emoji: '☕', text: `Lazy Sunday, ${nickname}` }
  if (day === 1) return { emoji: '💪', text: `New week, ${nickname}` }

  // Late night special (11pm - 4am)
  if (hour >= 23 || hour < 4) {
    const lateNight = [
      { emoji: '🌙', text: `Burning the midnight oil, ${nickname}` },
      { emoji: '🦉', text: `Night owl mode, ${nickname}` },
      { emoji: '⏰', text: `It's late, ${nickname}` },
      { emoji: '🌃', text: `Late night degen hours, ${nickname}` },
    ]
    return lateNight[Math.floor(Math.random() * lateNight.length)]
  }

  // Early morning (4am - 6am)
  if (hour >= 4 && hour < 6) {
    return { emoji: '🌅', text: `Early bird, ${nickname}` }
  }

  // Standard time-based
  if (hour >= 6 && hour < 12) {
    const morning = [
      { emoji: '☀️', text: `Good morning, ${nickname}` },
      { emoji: '🌤️', text: `Rise and grind, ${nickname}` },
      { emoji: '☕', text: `Coffee time, ${nickname}` },
    ]
    return morning[Math.floor(Math.random() * morning.length)]
  }

  if (hour >= 12 && hour < 17) {
    const afternoon = [
      { emoji: '☀️', text: `Good afternoon, ${nickname}` },
      { emoji: '🚀', text: `Let's get it, ${nickname}` },
      { emoji: '📈', text: `Stack mode, ${nickname}` },
    ]
    return afternoon[Math.floor(Math.random() * afternoon.length)]
  }

  if (hour >= 17 && hour < 21) {
    const evening = [
      { emoji: '🌆', text: `Good evening, ${nickname}` },
      { emoji: '🌇', text: `Golden hour, ${nickname}` },
    ]
    return evening[Math.floor(Math.random() * evening.length)]
  }

  // Night (9pm - 11pm)
  return { emoji: '🌙', text: `Good night, ${nickname}` }
}

interface EmptyStateProps {
  children?: ReactNode // ChatInput goes here
}

/**
 * EmptyState Component
 *
 * Minimal empty chat state with:
 * - Time-based contextual greeting with random crypto nicknames
 * - Elegant serif typography
 * - Input box centered below greeting
 *
 * Uses useState + useEffect to avoid SSR/client hydration mismatch
 * (Math.random() would produce different values on server vs client)
 */
export function EmptyState({ children }: EmptyStateProps) {
  // Client-only random selection to avoid hydration mismatch
  const [nickname, setNickname] = useState<string | null>(null)
  const [greeting, setGreeting] = useState<{ emoji: string; text: string } | null>(null)

  useEffect(() => {
    const nick = NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)]
    setNickname(nick)
    setGreeting(getGreeting(nick))
  }, [])

  // SSR placeholder - empty div with same dimensions to prevent layout shift
  if (!nickname || !greeting) {
    return <div className="flex flex-col items-center justify-center h-full px-4" />
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      {/* Greeting - Elegant serif typography */}
      <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-light tracking-tight text-center mb-10">
        <span className="mr-3 inline-block">{greeting.emoji}</span>
        {greeting.text}
      </h1>

      {/* Input (passed as children) */}
      {children}
    </div>
  )
}
