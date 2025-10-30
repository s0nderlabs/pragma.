'use client'

import { useRef } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/Accordion'
import { BalanceHeader } from '../sidebar/BalanceHeader'
import { ChatHistory } from '../sidebar/ChatHistory'
import { ReceiptArchive } from '../sidebar/ReceiptArchive'
import { SettingsPanel } from '../sidebar/SettingsPanel'
import gsap from 'gsap'

/**
 * Sidebar Component - Card-Based Layout
 *
 * Now lives INSIDE ChatContainer glass panel with card-based design.
 * Design: Simple balance text + 3 separate rounded cards (32px corners).
 *
 * Desktop: Toggles between 320px and 0px
 * Mobile: Slides in/out from left
 */
export function Sidebar() {
  const { isOpen, isMobileOpen, activeSection, toggle, setMobileOpen, setActiveSection } = useSidebarStore()
  const { theme } = useThemeStore()

  // Refs for hover animations
  const historyCardRef = useRef<HTMLDivElement>(null)
  const receiptsCardRef = useRef<HTMLDivElement>(null)
  const settingsCardRef = useRef<HTMLDivElement>(null)

  const handleToggle = () => {
    const isMobile = window.innerWidth <= 768
    if (isMobile) {
      setMobileOpen(!isMobileOpen)
    } else {
      toggle()
    }
  }

  // Elastic hover handlers
  const handleCardHover = (element: HTMLDivElement | null, isEntering: boolean) => {
    if (!element) return

    if (isEntering) {
      gsap.to(element, {
        scale: 1.02,
        duration: 0.4,
        ease: 'elastic.out(1, 0.3)',
      })
    } else {
      gsap.to(element, {
        scale: 1,
        duration: 0.3,
        ease: 'power2.out',
      })
    }
  }

  return (
    <div className="h-full p-4">
      {/* Glass Container Wrapper */}
      <LiquidGlassPanel
        theme={theme}
        className="h-full rounded-[32px] flex flex-col p-4 relative"
        blurAmount={6}
        displacementScale={0.3}
        stdDeviation={0.03}
      >
        {/* Balance - Simple text (no card) */}
        <BalanceHeader />

        {/* Spacing after balance */}
        <div className="h-6" />

        {/* Cards - Scrollable section */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Card 1: Chat History */}
          <div
            ref={historyCardRef}
            onMouseEnter={() => handleCardHover(historyCardRef.current, true)}
            onMouseLeave={() => handleCardHover(historyCardRef.current, false)}
          >
            <LiquidGlassPanel
              theme={theme}
              className="rounded-[32px] overflow-hidden"
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
                <AccordionTrigger className="px-6 py-4 hover:bg-white/5">
                  Chat History
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4">
                  <ChatHistory />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            </LiquidGlassPanel>
          </div>

          {/* Card 2: Receipt Archive */}
          <div
            ref={receiptsCardRef}
            onMouseEnter={() => handleCardHover(receiptsCardRef.current, true)}
            onMouseLeave={() => handleCardHover(receiptsCardRef.current, false)}
          >
            <LiquidGlassPanel
              theme={theme}
              className="rounded-[32px] overflow-hidden"
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
                <AccordionTrigger className="px-6 py-4 hover:bg-white/5">
                  Receipt Archive
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4">
                  <ReceiptArchive />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            </LiquidGlassPanel>
          </div>

          {/* Card 3: Settings */}
          <div
            ref={settingsCardRef}
            onMouseEnter={() => handleCardHover(settingsCardRef.current, true)}
            onMouseLeave={() => handleCardHover(settingsCardRef.current, false)}
          >
            <LiquidGlassPanel
              theme={theme}
              className="rounded-[32px] overflow-hidden"
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
                <AccordionTrigger className="px-6 py-4 hover:bg-white/5">
                  Settings
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4">
                  <SettingsPanel />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            </LiquidGlassPanel>
          </div>
        </div>

        {/* Toggle Buttons */}
        {/* Desktop: Chevron (bottom, aligned with sidebar edge) */}
        <button
          onClick={handleToggle}
          className="hidden lg:block mt-4 p-2 rounded-lg bg-[color-mix(in_srgb,var(--liquid-glass-color)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--liquid-glass-color)_18%,transparent)] transition-all shadow-lg w-fit"
          aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isOpen ? (
            <ChevronLeft className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </button>

        {/* Mobile: Close X (top-right, absolute) */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden absolute top-4 right-4 p-2 rounded-lg bg-[color-mix(in_srgb,var(--liquid-glass-color)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--liquid-glass-color)_18%,transparent)] transition-all"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </LiquidGlassPanel>
    </div>
  )
}
