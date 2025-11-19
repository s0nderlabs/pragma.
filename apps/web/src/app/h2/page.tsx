'use client'

import { useEffect } from 'react'
import { H2Layout } from '@/components/h2/layout/H2Layout'
import { AgentProvider } from '@/contexts/H2AgentContext'
import { useH2_5Agent } from '@/hooks/useH2.5Agent'

/**
 * H2 Page - Client-Side LangChain Agent
 *
 * Uses H2.5 client-side agent execution.
 * Provides useH2_5Agent via context to child components.
 *
 * Architecture:
 * - LangChain agent runs in browser
 * - Direct wallet access (no signature transport)
 * - Real-time streaming callbacks
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

  return (
    <AgentProvider hook={useH2_5Agent}>
      <H2Layout />
    </AgentProvider>
  )
}
