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

/**
 * ThinkingIndicator Component
 *
 * Shows Unicode star spinner with rotating Pragma-style phrases.
 * Claude-inspired elegant animation with terracotta brand color.
 */
export function ThinkingIndicator() {
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

  // Phrase rotation: 1500ms per phrase
  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % PRAGMA_VIBES.length)
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="mb-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-2"
      >
        <span className="text-2xl font-mono text-[#E07A5F]">
          {SPINNER_FRAMES[frameIndex]}
        </span>

        <AnimatePresence mode="wait">
          <motion.span
            key={phraseIndex}
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 5 }}
            transition={{ duration: 0.3 }}
            className="text-sm font-medium text-[#E07A5F]"
            style={{ opacity: 0.9 }}
          >
            {PRAGMA_VIBES[phraseIndex]}...
          </motion.span>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
