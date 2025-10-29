'use client'

import { useId } from 'react'
import { LiquidGlassFilter } from './LiquidGlassFilter'
import type { LiquidGlassPanelProps } from './types'
import './theme-vars.css'

/**
 * Liquid Glass Panel Component
 *
 * A reusable glass morphism panel with liquid displacement effect.
 * Uses CSS backdrop-filter with SVG displacement mapping for authentic glass distortion.
 *
 * @example
 * ```tsx
 * <LiquidGlassPanel theme="dark" className="rounded-2xl p-6">
 *   <h1>Hello World</h1>
 * </LiquidGlassPanel>
 * ```
 */
export function LiquidGlassPanel({
  children,
  theme = 'light',
  className = '',
  style = {},
  stdDeviation = 0.04,
  displacementScale = 0.5,
  blurAmount = 8,
}: LiquidGlassPanelProps) {
  // Generate unique filter ID to avoid conflicts
  const componentId = useId().replace(/:/g, '')
  const filterId = `liquid-glass-filter-${componentId}`

  return (
    <div
      data-theme={theme}
      className={`relative ${className}`}
      style={{
        ...style,
        boxSizing: 'border-box',
        backdropFilter: `blur(${blurAmount}px) url(#${filterId}) saturate(var(--liquid-glass-saturation))`,
        WebkitBackdropFilter: `blur(${blurAmount}px) url(#${filterId}) saturate(var(--liquid-glass-saturation))`,
        backgroundColor: 'color-mix(in srgb, var(--liquid-glass-color) 12%, transparent)',
        boxShadow: `
          inset 0 0 0 1px color-mix(in srgb, var(--liquid-glass-light) calc(var(--liquid-glass-reflex-light) * 10%), transparent),
          inset 1.8px 3px 0px -2px color-mix(in srgb, var(--liquid-glass-light) calc(var(--liquid-glass-reflex-light) * 90%), transparent),
          inset -2px -2px 0px -2px color-mix(in srgb, var(--liquid-glass-light) calc(var(--liquid-glass-reflex-light) * 80%), transparent),
          inset -3px -8px 1px -6px color-mix(in srgb, var(--liquid-glass-light) calc(var(--liquid-glass-reflex-light) * 60%), transparent),
          inset -0.3px -1px 4px 0px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 12%), transparent),
          inset -1.5px 2.5px 0px -2px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 20%), transparent),
          inset 0px 3px 4px -2px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 20%), transparent),
          inset 2px -6.5px 1px -4px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 10%), transparent),
          0px 1px 5px 0px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 10%), transparent),
          0px 6px 16px 0px color-mix(in srgb, var(--liquid-glass-dark) calc(var(--liquid-glass-reflex-dark) * 8%), transparent)
        `,
        transition: 'background-color 400ms cubic-bezier(1, 0, 0.4, 1), box-shadow 400ms cubic-bezier(1, 0, 0.4, 1)',
      }}
    >
      {/* SVG Filter - MUST render before content for CSS to work */}
      <LiquidGlassFilter
        filterId={filterId}
        stdDeviation={stdDeviation}
        scale={displacementScale}
      />

      {/* Content */}
      {children}
    </div>
  )
}
