'use client'

// Import browser polyfills for LangChain compatibility
// MUST be imported before any LangChain agent code
import '@/lib/polyfills'

import { useEffect } from 'react'
import { H2Layout } from '@/components/h2/layout/H2Layout'
import { AgentProvider } from '@/contexts/H2AgentContext'
import { useH2_5Agent } from '@/hooks/useH2.5Agent'
import { QuickstartModal } from '@/components/h2/onboarding'
import '@/components/ui/terminal/terminal-theme.css'

export default function HomePage() {
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
        <QuickstartModal />
      </div>
    </AgentProvider>
  )
}
