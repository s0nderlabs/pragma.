'use client'

import { useEffect } from 'react'
import { H2Layout } from '@/components/h2/layout/H2Layout'

/**
 * H2 Page - Conversational AI Interface
 *
 * Phase 1: Layout Structure
 * - Responsive sidebar with accordion sections
 * - Chat container with placeholder
 * - Theme toggle functionality
 * - Mobile hamburger menu and overlay
 *
 * Future Phases:
 * - Phase 2: Message components and chat input
 * - Phase 3: Conversational UX (quotes, receipts, welcome screen)
 * - Phase 4: Multi-step timeline, real-time updates, Risk Gate
 */
export default function H2Page() {
  useEffect(() => {
    // Override body background for this page to prevent globals.css interference
    const originalBg = document.body.style.background
    document.body.style.background = 'transparent'

    return () => {
      document.body.style.background = originalBg
    }
  }, [])

  return <H2Layout />
}
