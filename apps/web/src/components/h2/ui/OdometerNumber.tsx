'use client'

import { useOdometerNumber } from '@/hooks/useOdometerNumber'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { OdometerDigit } from './OdometerDigit'
import { cn } from '@/lib/utils'

interface OdometerNumberProps {
  value: number
  format?: (value: number) => string
  className?: string
  duration?: number
  ease?: number[]
}

/**
 * OdometerNumber Component
 *
 * Animated number display with odometer-style vertical roll animation.
 * Each digit scrolls independently while symbols ($, ., ,) stay static.
 *
 * Perfect for:
 * - Financial balances ($1,234.56)
 * - Cryptocurrency amounts (10.5 MON)
 * - Percentage changes (+5.2%)
 *
 * Features:
 * - Smooth vertical digit rolling (like mechanical odometers)
 * - Independent digit animation
 * - Preserves formatting (currency symbols, decimals, commas)
 * - Accessibility support (respects reduced motion)
 * - Retro-modern aesthetic
 *
 * Usage:
 * ```tsx
 * <OdometerNumber
 *   value={1234.56}
 *   format={(v) => `$${v.toFixed(2)}`}
 *   className="text-3xl font-semibold"
 * />
 * ```
 */
export function OdometerNumber({
  value,
  format,
  className,
  duration = 0.5,
  ease = [0.22, 1, 0.36, 1]
}: OdometerNumberProps) {
  const digits = useOdometerNumber({ value, format })
  const prefersReducedMotion = usePrefersReducedMotion()

  return (
    <span className={cn('inline-flex items-baseline tabular-nums', className)}>
      {digits.map((digit) =>
        digit.type === 'digit' ? (
          <OdometerDigit
            key={digit.index}
            digit={Number(digit.value)}
            duration={duration}
            ease={ease}
            prefersReducedMotion={prefersReducedMotion}
          />
        ) : (
          <span key={digit.index} className="tabular-nums">
            {digit.value}
          </span>
        )
      )}
    </span>
  )
}
