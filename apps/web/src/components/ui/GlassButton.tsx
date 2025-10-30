'use client'

import * as React from 'react'

export type GlassButtonVariant = 'primary' | 'secondary' | 'ghost'

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: GlassButtonVariant
  children: React.ReactNode
}

export function GlassButton({
  variant = 'primary',
  className = '',
  children,
  ...props
}: GlassButtonProps) {
  const baseStyles = `
    relative
    px-4 py-2
    rounded-lg
    font-medium text-sm
    transition-all duration-300
    disabled:opacity-50 disabled:cursor-not-allowed
    ${className}
  `.trim()

  const variantStyles = {
    primary: `
      bg-[color-mix(in_srgb,var(--liquid-glass-color)_12%,transparent)]
      text-[var(--liquid-glass-content)]
      shadow-[
        inset_0_0_0_1px_color-mix(in_srgb,var(--liquid-glass-light)_10%,transparent),
        inset_1.8px_3px_0px_-2px_color-mix(in_srgb,var(--liquid-glass-light)_90%,transparent),
        inset_-2px_-2px_0px_-2px_color-mix(in_srgb,var(--liquid-glass-light)_80%,transparent),
        0px_1px_5px_0px_color-mix(in_srgb,var(--liquid-glass-dark)_10%,transparent)
      ]
      hover:bg-[color-mix(in_srgb,var(--liquid-glass-color)_18%,transparent)]
      active:scale-[0.98]
    `,
    secondary: `
      bg-transparent
      text-[var(--liquid-glass-content)]
      border border-[color-mix(in_srgb,var(--liquid-glass-color)_20%,transparent)]
      hover:bg-[color-mix(in_srgb,var(--liquid-glass-color)_8%,transparent)]
      active:scale-[0.98]
    `,
    ghost: `
      bg-transparent
      text-[var(--liquid-glass-content)]
      hover:bg-[color-mix(in_srgb,var(--liquid-glass-color)_8%,transparent)]
      active:scale-[0.98]
    `,
  }

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]}`}
      {...props}
    >
      {children}
    </button>
  )
}
