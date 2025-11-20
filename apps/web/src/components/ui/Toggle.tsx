'use client'

interface ToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
  label?: string
  disabled?: boolean
}

/**
 * Toggle Component - H2.5 Radical Redesign
 *
 * Option 4: Dot Indicator (SpaceNavigation Pattern)
 * - Dot that morphs width when active (8px → 32px)
 * - Matches SpaceNavigation.tsx dot animation exactly
 * - Ultra-minimal, very Dieter Rams
 * - Text label for clarity
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
        inline-flex items-center gap-2
        transition-all duration-200 ease-out
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-accent focus-visible:ring-offset-2
        focus-visible:ring-offset-background
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {/* Morphing dot indicator */}
      <div
        className={`
          h-2 rounded-full
          transition-all duration-300 ease-out
          ${enabled
            ? 'w-8 bg-accent'
            : 'w-2 bg-white/20 hover:bg-white/30'
          }
        `}
      />

      {/* Text label */}
      <span className={`
        text-xs font-medium transition-colors duration-200
        ${enabled ? 'text-white' : 'text-white/40'}
      `}>
        {enabled ? 'On' : 'Off'}
      </span>
    </button>
  )
}
