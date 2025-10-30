'use client'

import { useState, useRef, useEffect } from 'react'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { Sidebar } from './Sidebar'
import { MessageList } from '../chat/MessageList'
import { ChatInput } from '../chat/ChatInput'
import { SettingsMenu } from '../chat/SettingsMenu'
import gsap from 'gsap'

/**
 * ChatContainer Component
 *
 * Unified full-screen glass panel containing:
 * - Sidebar (left, toggleable)
 * - Messages area (right, flex-1)
 *
 * Desktop: Sidebar toggles 320px ↔ 0px
 * Mobile: Sidebar overlays from left (-100% ↔ 0%)
 *
 * This is the main H2 UI surface.
 */
export function ChatContainer() {
  const { isOpen, isMobileOpen } = useSidebarStore()
  const { theme } = useThemeStore()
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)

  // Desktop: Animate sidebar collapse/expand
  useEffect(() => {
    if (!sidebarRef.current) return

    const isMobile = window.innerWidth <= 768
    if (isMobile) return

    gsap.to(sidebarRef.current, {
      width: isOpen ? '320px' : '0px',
      duration: 0.5,
      ease: isOpen ? 'elastic.out(1, 0.4)' : 'power2.inOut',
    })
  }, [isOpen])

  // Mobile: Animate sidebar overlay
  useEffect(() => {
    if (!sidebarRef.current) return

    const isMobile = window.innerWidth <= 768
    if (!isMobile) return

    if (isMobileOpen) {
      // Slide in from left with elastic bounce
      gsap.fromTo(
        sidebarRef.current,
        { x: '-100%' },
        {
          x: '0%',
          duration: 0.6,
          ease: 'elastic.out(1, 0.5)',
        }
      )
    } else {
      // Slide out to left (smooth, no bounce)
      gsap.to(sidebarRef.current, {
        x: '-100%',
        duration: 0.3,
        ease: 'power2.in',
      })
    }
  }, [isMobileOpen])

  return (
    <div className="w-full h-full">
      <LiquidGlassPanel
        theme={theme}
        className="h-full rounded-none"
        blurAmount={8}
        displacementScale={0.5}
        stdDeviation={0.04}
      >
        <div className="flex h-full relative overflow-hidden">
          {/* Sidebar Section */}
          <div
            ref={sidebarRef}
            className="h-full relative z-10"
            style={{
              width: '320px',  // Initial width, animated by GSAP
              minWidth: '0px',
            }}
          >
            <Sidebar />
          </div>

          {/* Messages Section */}
          <div className="flex-1 flex flex-col relative">
            {/* Message List */}
            <MessageList />

            {/* Settings Menu */}
            <SettingsMenu
              isOpen={settingsMenuOpen}
              onClose={() => setSettingsMenuOpen(false)}
            />

            {/* Chat Input */}
            <ChatInput onSettingsClick={() => setSettingsMenuOpen(!settingsMenuOpen)} />
          </div>

          {/* Mobile Backdrop (when sidebar open) */}
          {isMobileOpen && (
            <div
              className="lg:hidden absolute inset-0 bg-black/20 backdrop-blur-sm z-0"
              onClick={() => useSidebarStore.getState().setMobileOpen(false)}
            />
          )}
        </div>
      </LiquidGlassPanel>
    </div>
  )
}
