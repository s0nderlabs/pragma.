'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const THINKING_VERBS = [
  'Routing...',
  'Simulating...',
  'Analyzing...',
  'Optimizing...',
  'Processing...',
  'Computing...',
  'Thinking...',
]

/**
 * ThinkingIndicator Component
 *
 * Shows rotating Pragma-specific verbs with purple shimmer animation.
 * Indicates agent is processing the request.
 */
export function ThinkingIndicator() {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    // Rotate through verbs every 1.2 seconds
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % THINKING_VERBS.length)
    }, 1200)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="mb-6">
      <div className="relative inline-block">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="shimmer-text text-base text-purple-400/80"
          >
            {THINKING_VERBS[currentIndex]}
          </motion.div>
        </AnimatePresence>
      </div>

      <style jsx>{`
        .shimmer-text {
          background: linear-gradient(
            90deg,
            rgba(131, 110, 249, 0.4) 0%,
            rgba(131, 110, 249, 1) 50%,
            rgba(131, 110, 249, 0.4) 100%
          );
          background-size: 200% 100%;
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 2s ease-in-out infinite;
        }

        @keyframes shimmer {
          0% {
            background-position: -100% 0;
          }
          50% {
            background-position: 100% 0;
          }
          100% {
            background-position: -100% 0;
          }
        }
      `}</style>
    </div>
  )
}
