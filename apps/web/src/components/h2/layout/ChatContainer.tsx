'use client'

import { useState, useRef, useEffect } from 'react'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { Sidebar } from './Sidebar'
import { MessageList } from '../chat/MessageList'
import { ChatInput } from '../chat/ChatInput'
import { SettingsMenu } from '../chat/SettingsMenu'
import { Menu, X } from 'lucide-react'
import gsap from 'gsap'

/**
 * ChatContainer Component
 *
 * Unified full-screen glass panel containing:
 * - Sidebar (left, toggleable glass accordion)
 * - Messages area (right, flex-1)
 *
 * Desktop: Sidebar toggles 400px ↔ 0px (simple smooth transition)
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
      width: isOpen ? '400px' : '0px',
      duration: 0.3,
      ease: 'power2.inOut',
    })
  }, [isOpen])

  // Mobile: Animate sidebar overlay
  useEffect(() => {
    if (!sidebarRef.current) return

    const isMobile = window.innerWidth <= 768
    if (!isMobile) return

    if (isMobileOpen) {
      // Slide in from left
      gsap.fromTo(
        sidebarRef.current,
        { x: '-100%' },
        {
          x: '0%',
          duration: 0.3,
          ease: 'power2.out',
        }
      )
    } else {
      // Slide out to left
      gsap.to(sidebarRef.current, {
        x: '-100%',
        duration: 0.3,
        ease: 'power2.in',
      })
    }
  }, [isMobileOpen])

  return (
    <div className="w-full h-full relative">
      {/* Toggle Button - Fixed position, always visible */}
      <button
        onClick={() => useSidebarStore.getState().toggle()}
        className="hidden lg:block fixed top-6 z-50 transition-all duration-300"
        style={{
          left: isOpen ? '416px' : '24px', // 400px sidebar + 16px padding when open, else left edge
        }}
        aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        <LiquidGlassPanel
          theme={theme}
          className="w-12 h-12 rounded-full flex items-center justify-center hover:shadow-lg transition-all"
          blurAmount={6}
          displacementScale={0.3}
          stdDeviation={0.03}
        >
          {isOpen ? (
            <X className="w-5 h-5 opacity-60" />
          ) : (
            <Menu className="w-5 h-5 opacity-60" />
          )}
        </LiquidGlassPanel>
      </button>

      {/* <LiquidGlassPanel
        theme={theme}
        className="h-full rounded-none"
        blurAmount={8}
        displacementScale={0.5}
        stdDeviation={0.04}
      > */}
        <div className="flex h-full relative overflow-hidden">
          {/* Sidebar Section (always rendered, width animated) */}
          <div
            ref={sidebarRef}
            className="h-full relative z-10 overflow-hidden"
            style={{
              width: '400px',  // Initial width, animated by GSAP
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
            <ChatInput />
          </div>

          {/* Mobile Backdrop (when sidebar open) */}
          {isMobileOpen && (
            <div
              className="lg:hidden absolute inset-0 bg-black/20 backdrop-blur-sm z-0"
              onClick={() => useSidebarStore.getState().setMobileOpen(false)}
            />
          )}
        </div>
      {/* </LiquidGlassPanel> */}
    </div>
  )
}
