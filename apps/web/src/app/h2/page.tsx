'use client'

import { useEffect } from 'react'
import { H2Layout } from '@/components/h2/layout/H2Layout'
import { AgentProvider } from '@/contexts/H2AgentContext'
import { useH2Agent } from '@/hooks/useH2Agent'

/**
 * H2 Page - Server-Side LangChain Agent
 *
 * Uses server-side agent execution with SSE streaming.
 * Provides useH2Agent via context to child components.
 *
 * Architecture:
 * - LangChain agent runs on server (Node.js)
 * - SSE streaming for real-time updates
 * - Signature transport via SSE + HTTP POST (4 round-trips per swap)
 *
 * For client-side execution, see /h2.5 route.
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
    <AgentProvider hook={useH2Agent}>
      <H2Layout />
    </AgentProvider>
  )
}
