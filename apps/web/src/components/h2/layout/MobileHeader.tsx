'use client'

import { Menu } from 'lucide-react'
import { useSidebarStore } from '@/stores/useSidebarStore'

/**
 * MobileHeader Component
 *
 * Only visible on mobile (≤768px)
 * Contains hamburger menu icon to open sidebar overlay
 * Glass background bar across top
 */
export function MobileHeader() {
  const { setMobileOpen } = useSidebarStore()

  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-16 flex items-center px-4 bg-[color-mix(in_srgb,var(--liquid-glass-color)_12%,transparent)] backdrop-blur-lg border-b border-white/10">
      <button
        onClick={() => setMobileOpen(true)}
        className="p-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--liquid-glass-color)_18%,transparent)] transition-colors"
        aria-label="Open sidebar"
      >
        <Menu className="w-6 h-6" />
      </button>

      <h1 className="ml-4 text-lg font-semibold">Pragma</h1>
    </div>
  )
}
