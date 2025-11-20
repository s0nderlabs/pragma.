'use client'

import { useMemo } from 'react'

export interface DigitConfig {
  type: 'digit' | 'symbol'
  value: string | number
  index: number
}

interface UseOdometerNumberOptions {
  value: number
  format?: (value: number) => string
}

/**
 * useOdometerNumber Hook
 *
 * Splits a formatted number into individual digits and symbols
 * for odometer-style animation. Each digit will animate independently,
 * while symbols (currency, decimals, commas) stay static.
 *
 * Example:
 * Input: 1234.56 with format="$1,234.56"
 * Output: [
 *   { type: 'symbol', value: '$', index: 0 },
 *   { type: 'digit', value: 1, index: 1 },
 *   { type: 'symbol', value: ',', index: 2 },
 *   { type: 'digit', value: 2, index: 3 },
 *   { type: 'digit', value: 3, index: 4 },
 *   { type: 'digit', value: 4, index: 5 },
 *   { type: 'symbol', value: '.', index: 6 },
 *   { type: 'digit', value: 5, index: 7 },
 *   { type: 'digit', value: 6, index: 8 },
 * ]
 */
export function useOdometerNumber({
  value,
  format = (v) => v.toFixed(2)
}: UseOdometerNumberOptions): DigitConfig[] {
  return useMemo(() => {
    // Format the number to string
    const formattedValue = format(value)

    // Split into individual characters and classify
    const digits: DigitConfig[] = formattedValue.split('').map((char, index) => {
      // Check if character is a digit (0-9)
      const isDigit = /\d/.test(char)

      if (isDigit) {
        return {
          type: 'digit',
          value: parseInt(char, 10),
          index
        }
      } else {
        return {
          type: 'symbol',
          value: char,
          index
        }
      }
    })

    return digits
  }, [value, format])
}
