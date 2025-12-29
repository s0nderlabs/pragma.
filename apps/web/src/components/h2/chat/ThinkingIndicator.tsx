'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const SPINNER_FRAMES = ['✦', '✧', '✶', '✷', '✸', '✹', '✺', '✻']

const PRAGMA_VIBES = [
  'Finding Alpha',
  'Building Magic',
  'Securing Vibes',
  'Preparing Execution',
  'Summoning Liquidity',
  'Channeling Protocols',
  'Consulting The Chain',
  'Brewing Transactions',
  'Weaving Smart Contracts',
  'Harmonizing Validators',
]

// Colors
const TERRACOTTA = '#E07A5F'
const ERROR_RED = '#DC2626'

interface ThinkingIndicatorProps {
  isRetrying?: boolean
}

/**
 * ThinkingIndicator Component
 *
 * Shows Unicode star spinner with rotating Pragma-style phrases.
 * When isRetrying is true, shows retry message instead.
 * Claude-inspired elegant animation with terracotta brand color.
 */
export function ThinkingIndicator({ isRetrying = false }: ThinkingIndicatorProps) {
  const [frameIndex, setFrameIndex] = useState(0)
  const [phraseIndex, setPhraseIndex] = useState(
    Math.floor(Math.random() * PRAGMA_VIBES.length)
  )

  // Spinner rotation: 100ms per frame (smooth 8-frame rotation)
  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length)
    }, 100)
    return () => clearInterval(interval)
  }, [])

  // Phrase rotation: 1500ms per phrase (only when not retrying)
  useEffect(() => {
    if (isRetrying) return // Don't rotate phrases during retry

    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % PRAGMA_VIBES.length)
    }, 1500)
    return () => clearInterval(interval)
  }, [isRetrying])

  // Choose color and message based on retry state
  const color = isRetrying ? ERROR_RED : TERRACOTTA
  const message = isRetrying
    ? "Hmm, that didn't come out right. Working on a better response"
    : PRAGMA_VIBES[phraseIndex]

  return (
    <div className="mb-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-2"
      >
        <span className="text-2xl font-mono" style={{ color }}>
          {SPINNER_FRAMES[frameIndex]}
        </span>

        <AnimatePresence mode="wait">
          <motion.span
            key={isRetrying ? 'retry' : phraseIndex}
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 5 }}
            transition={{ duration: 0.3 }}
            className="text-sm font-medium"
          >
            <span
              className={isRetrying ? 'shimmer-retry' : ''}
              style={isRetrying ? { opacity: 0.9 } : { color, opacity: 0.9 }}
            >
              {message}...
            </span>
          </motion.span>
        </AnimatePresence>
      </motion.div>

      {/* Shimmer animation styles - global because styled-jsx scoping breaks with framer-motion */}
      <style jsx global>{`
        @keyframes thinking-shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
        .shimmer-retry {
          background: linear-gradient(
            90deg,
            #DC2626 0%,
            #fca5a5 50%,
            #DC2626 100%
          );
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: thinking-shimmer 5s linear infinite;
        }
      `}</style>
    </div>
  )
}
