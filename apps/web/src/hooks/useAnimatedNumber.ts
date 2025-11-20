'use client'

import { useEffect } from 'react'
import { useSpring, useTransform, type SpringOptions } from 'framer-motion'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

interface UseAnimatedNumberOptions {
  value: number
  format?: (value: number) => string
  spring?: SpringOptions
}

/**
 * useAnimatedNumber Hook
 *
 * Animates number changes with smooth spring physics.
 * Numbers count up/down instead of instantly changing.
 *
 * Features:
 * - Smooth spring animations (configurable stiffness, damping, mass)
 * - Respects user's reduced motion preference
 * - Maintains number formatting during animation
 * - Works with currency, percentages, decimals
 *
 * Usage:
 * ```tsx
 * const animatedBalance = useAnimatedNumber({
 *   value: balance,
 *   format: (v) => `$${v.toFixed(2)}`,
 *   spring: { stiffness: 75, damping: 15 }
 * })
 *
 * return <motion.span>{animatedBalance}</motion.span>
 * ```
 */
export function useAnimatedNumber({
  value,
  format,
  spring = { stiffness: 75, damping: 15, mass: 0.8 }
}: UseAnimatedNumberOptions) {
  const prefersReducedMotion = usePrefersReducedMotion()

  // Create spring value - if reduced motion, disable animation
  const springValue = useSpring(
    value,
    prefersReducedMotion ? { duration: 0 } : spring
  )

  // Transform to formatted display value
  const display = useTransform(springValue, (current) => {
    if (format) {
      return format(current)
    }
    return current.toFixed(2)
  })

  // Update spring when value changes
  useEffect(() => {
    springValue.set(value)
  }, [springValue, value])

  return display
}
