'use client'

import { useState, useEffect } from 'react'

/**
 * Hook to detect if the current viewport is mobile
 *
 * @param breakpoint - Width threshold in px (default: 1024 = lg breakpoint)
 * @returns boolean - true if viewport width < breakpoint
 */
export function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint)

    // Initial check
    check()

    // Listen for resize
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])

  return isMobile
}
