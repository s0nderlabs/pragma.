'use client'

import { useState, useEffect } from 'react'
import { X, MessageSquare, Activity, Settings } from 'lucide-react'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/Accordion'
import { BalanceCard } from '../sidebar/BalanceCard'
import { ChatHistory } from '../sidebar/ChatHistory'
import { ReceiptArchive } from '../sidebar/ReceiptArchive'
import { SettingsPanel } from '../sidebar/SettingsPanel'

/**
 * Sidebar Component - Glass Accordion Layout
 *
 * Clean accordion design with glass cards:
 * - BalanceCard at top (address + balance with toggle)
 * - 3 accordion sections with nested glass cards
 * - Only one section can be open at a time
 * - Simple CSS transitions (no elastic animations)
 *
 * Desktop: 400px width (toggle button in ChatContainer)
 * Mobile: Slides in/out from left as overlay
 */
export function Sidebar() {
  const { activeSection, setActiveSection, setMobileOpen } = useSidebarStore()
  const { theme: pragmaTheme } = useThemeStore()

  return (
    <div className="h-full p-4">
      {/* Main Glass Container */}
      <LiquidGlassPanel
        theme={pragmaTheme}
        className="h-full rounded-[32px] flex flex-col p-4 relative"
        blurAmount={6}
        displacementScale={0.3}
        stdDeviation={0.03}
      >
        {/* Balance Card */}
        <div className="mb-6">
          <BalanceCard />
        </div>

        {/* Scrollable Accordion Section */}
        <div className="flex-1 overflow-y-auto space-y-4 px-1 py-1">
          {/* Card 1: Chat */}
          <LiquidGlassPanel
            theme={pragmaTheme}
            className="rounded-[32px] overflow-hidden transition-all duration-300 hover:shadow-lg"
            blurAmount={4}
            displacementScale={0.2}
            stdDeviation={0.02}
          >
            <Accordion
              type="single"
              collapsible
              value={activeSection === 'history' ? 'history' : ''}
              onValueChange={(value) => setActiveSection(value === 'history' ? 'history' : null)}
            >
              <AccordionItem value="history" className="border-0">
                <AccordionTrigger className="px-6 py-4 hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 opacity-60" />
                    <span>Chat</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <ChatHistory />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </LiquidGlassPanel>

          {/* Card 2: Activity */}
          <LiquidGlassPanel
            theme={pragmaTheme}
            className="rounded-[32px] overflow-hidden transition-all duration-300 hover:shadow-lg"
            blurAmount={4}
            displacementScale={0.2}
            stdDeviation={0.02}
          >
            <Accordion
              type="single"
              collapsible
              value={activeSection === 'receipts' ? 'receipts' : ''}
              onValueChange={(value) => setActiveSection(value === 'receipts' ? 'receipts' : null)}
            >
              <AccordionItem value="receipts" className="border-0">
                <AccordionTrigger className="px-6 py-4 hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 opacity-60" />
                    <span>Activity</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <ReceiptArchive />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </LiquidGlassPanel>

          {/* Card 3: Settings */}
          <LiquidGlassPanel
            theme={pragmaTheme}
            className="rounded-[32px] overflow-hidden transition-all duration-300 hover:shadow-lg"
            blurAmount={4}
            displacementScale={0.2}
            stdDeviation={0.02}
          >
            <Accordion
              type="single"
              collapsible
              value={activeSection === 'settings' ? 'settings' : ''}
              onValueChange={(value) => setActiveSection(value === 'settings' ? 'settings' : null)}
            >
              <AccordionItem value="settings" className="border-0">
                <AccordionTrigger className="px-6 py-4 hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 opacity-60" />
                    <span>Settings</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <SettingsPanel />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </LiquidGlassPanel>
        </div>

        {/* Mobile: Close X (top-right, absolute) */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden absolute top-4 right-4 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </LiquidGlassPanel>
    </div>
  )
}
