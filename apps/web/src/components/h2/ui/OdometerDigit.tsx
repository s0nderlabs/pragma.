'use client'

import { motion } from 'framer-motion'
import { useRef, useEffect } from 'react'

interface OdometerDigitProps {
  digit: number
  duration?: number
  ease?: [number, number, number, number]
  prefersReducedMotion?: boolean
}

/**
 * OdometerDigit Component
 *
 * Displays a single digit (0-9) with vertical roll animation.
 * The digit appears to scroll vertically like an odometer or train station display.
 *
 * Implementation:
 * - Creates a vertical column containing all digits 0-9
 * - Container shows only one digit at a time (overflow: hidden)
 * - Uses translateY to scroll to the correct digit
 * - Smooth deceleration easing for mechanical feel
 *
 * Example:
 * To show digit "3", the column translates to -300% (3 × 100%)
 */
export function OdometerDigit({
  digit,
  duration = 0.5,
  ease = [0.22, 1, 0.36, 1], // Custom ease-out curve
  prefersReducedMotion = false
}: OdometerDigitProps) {
  // Clamp digit to 0-9 range
  const clampedDigit = Math.max(0, Math.min(9, Math.floor(digit)))

  // Track if component has mounted to enable animation after first render
  const hasMounted = useRef(false)

  useEffect(() => {
    // Enable animation after initial mount
    hasMounted.current = true
  }, [])

  return (
    <div
      className="relative inline-block overflow-hidden align-baseline"
      style={{ height: '1em', width: '0.6em' }}
    >
      <motion.div
        className="flex flex-col"
        initial={{ y: `-${clampedDigit}em` }} // Set initial position without animation
        animate={{
          y: `-${clampedDigit}em`
        }}
        transition={
          prefersReducedMotion || !hasMounted.current
            ? { duration: 0 }
            : {
                duration,
                ease
              }
        }
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <span
            key={d}
            className="block tabular-nums"
            style={{ height: '1em', lineHeight: '1em' }}
            aria-hidden={d !== clampedDigit}
          >
            {d}
          </span>
        ))}
      </motion.div>
    </div>
  )
}
