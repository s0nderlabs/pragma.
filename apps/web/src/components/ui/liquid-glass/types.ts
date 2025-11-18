export type Theme = 'light' | 'dark' | 'dim' | 'pragma-light' | 'pragma-dark'

export interface LiquidGlassFilterProps {
  /**
   * Unique ID for the SVG filter element
   */
  filterId: string
  /**
   * Standard deviation for the Gaussian blur effect
   * @default 0.04
   */
  stdDeviation?: number
  /**
   * Scale factor for displacement mapping
   * @default 0.5
   */
  scale?: number
}

export interface LiquidGlassPanelProps {
  /**
   * Content to render inside the glass panel
   */
  children: React.ReactNode
  /**
   * Theme for the glass effect
   * @default 'light'
   */
  theme?: Theme
  /**
   * Additional CSS classes
   */
  className?: string
  /**
   * Additional inline styles
   */
  style?: React.CSSProperties
  /**
   * Standard deviation for the Gaussian blur
   * @default 0.04
   */
  stdDeviation?: number
  /**
   * Displacement scale
   * @default 0.5
   */
  displacementScale?: number
  /**
   * Blur amount in pixels
   * @default 8
   */
  blurAmount?: number
}
