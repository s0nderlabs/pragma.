'use client'

import { motion } from 'framer-motion'

interface ToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
  label?: string
  disabled?: boolean
}

/**
 * Toggle Component
 *
 * iOS-style toggle switch with glass morphism design.
 * Purple accent (#836EF9) when active.
 */
export function Toggle({ enabled, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!enabled)}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full
        transition-all duration-300 ease-out
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${enabled
          ? 'bg-[#836EF9]/80 shadow-[0_0_20px_rgba(131,110,249,0.3)]'
          : 'bg-white/10 backdrop-blur-sm'
        }
      `}
    >
      <motion.span
        layout
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 30,
        }}
        className={`
          inline-block h-4 w-4 rounded-full
          bg-white shadow-lg
          ${enabled ? 'translate-x-6' : 'translate-x-1'}
          transition-transform duration-300 ease-out
        `}
      />
    </button>
  )
}
