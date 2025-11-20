'use client'

// Import browser polyfills for LangChain compatibility
// MUST be imported before any LangChain agent code
import '@/lib/polyfills'

import { useEffect } from 'react'
import { H2Layout } from '@/components/h2/layout/H2Layout'
import { AgentProvider } from '@/contexts/H2AgentContext'
import { useH2_5Agent } from '@/hooks/useH2.5Agent'
import '@/components/ui/terminal/terminal-theme.css'

/**
 * H2.5 Page - Client-Side LangChain Agent
 *
 * This is a parallel implementation of H2 that runs LangChain agent execution
 * entirely in the browser (client-side) instead of server-side with SSE bridge.
 *
 * Key Differences from H2:
 * - LangChain agent runs in browser (no server-side execution)
 * - Direct Web3Auth bridge (no signature transport over network!)
 * - No SSE/EventEmitter coordination overhead
 * - More stable (eliminates 4 network round-trips per swap)
 *
 * Architecture:
 * - Browser polyfills (Zone.js + AsyncLocalStorage) for LangChain compatibility
 * - Direct wallet signing (DirectWeb3AuthBridge)
 * - All @pragma/core execution logic unchanged
 * - Streaming via callbacks (not SSE)
 *
 * Access: http://localhost:3000/h2.5 (no navigation UI, direct URL only)
 */
export default function H25Page() {
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
      <div className="min-h-screen bg-background">
        <H2Layout />
      </div>
    </AgentProvider>
  )
}
