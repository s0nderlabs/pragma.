/**
 * Custom Activity Icons - Dieter Rams × Jony Ive Aesthetic
 *
 * Pure geometric SVG icons for DeFi actions
 * - 20×20 viewBox (consistent optical size)
 * - 1.5px stroke weight (unified visual language)
 * - currentColor (inherits text color)
 * - No fills, stroke only (minimal)
 */

interface IconProps {
  className?: string
}

/**
 * Swap Icon - Two curved arrows forming X (bidirectional exchange)
 */
export function SwapIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Top-left to bottom-right arrow (↘) */}
      <path d="M4 4 L12 12" />
      <path d="M9 12 L12 12 L12 9" />

      {/* Bottom-left to top-right arrow (↗) */}
      <path d="M4 16 L12 8" />
      <path d="M12 11 L12 8 L9 8" />
    </svg>
  )
}

/**
 * Transfer Icon - Arrow with trailing dots (sending to destination)
 */
export function TransferIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Arrow pointing right */}
      <path d="M3 10 L15 10" />
      <path d="M12 7 L15 10 L12 13" />

      {/* Trailing motion dots */}
      <circle cx="2" cy="10" r="0.75" fill="currentColor" />
      <circle cx="5" cy="10" r="0.75" fill="currentColor" />
      <circle cx="8" cy="10" r="0.75" fill="currentColor" />
    </svg>
  )
}

/**
 * Wrap Icon - Circle with inward brackets (enclosing/wrapping)
 */
export function WrapIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Center circle */}
      <circle cx="10" cy="10" r="5" />

      {/* Four inward-pointing corner brackets */}
      {/* Top-left */}
      <path d="M3 6 L3 3 L6 3" />
      {/* Top-right */}
      <path d="M14 3 L17 3 L17 6" />
      {/* Bottom-right */}
      <path d="M17 14 L17 17 L14 17" />
      {/* Bottom-left */}
      <path d="M6 17 L3 17 L3 14" />
    </svg>
  )
}

/**
 * Unwrap Icon - Circle with outward brackets (releasing/unwrapping)
 */
export function UnwrapIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Center circle */}
      <circle cx="10" cy="10" r="5" />

      {/* Four outward-pointing corner brackets */}
      {/* Top-left */}
      <path d="M6 3 L3 3 L3 6" />
      {/* Top-right */}
      <path d="M17 6 L17 3 L14 3" />
      {/* Bottom-right */}
      <path d="M14 17 L17 17 L17 14" />
      {/* Bottom-left */}
      <path d="M3 14 L3 17 L6 17" />
    </svg>
  )
}

/**
 * Stake Icon - Upward arrow entering vault (depositing)
 */
export function StakeIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Vault container (open top) */}
      <path d="M5 8 L5 16 L15 16 L15 8" />

      {/* Upward arrow entering vault */}
      <path d="M10 14 L10 3" />
      <path d="M7 6 L10 3 L13 6" />
    </svg>
  )
}

/**
 * Unstake Icon - Hourglass with flowing sand (time-based withdrawal)
 */
export function UnstakeIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Hourglass frame */}
      <path d="M6 3 L14 3" />
      <path d="M6 17 L14 17" />

      {/* Top chamber */}
      <path d="M7 3 L7 7 L10 10" />
      <path d="M13 3 L13 7 L10 10" />

      {/* Bottom chamber */}
      <path d="M10 10 L7 13 L7 17" />
      <path d="M10 10 L13 13 L13 17" />

      {/* Sand in top chamber */}
      <path d="M8 4.5 L12 4.5" strokeWidth="1" />
      <path d="M8.5 6 L11.5 6" strokeWidth="1" />
    </svg>
  )
}

/**
 * UnstakeClaim Icon - Open hand receiving coins (claiming rewards)
 */
export function UnstakeClaimIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Open hand (palm) */}
      <path d="M3 14 L3 10 C3 9 3.5 8.5 4 8.5" />
      <path d="M17 14 L17 10 C17 9 16.5 8.5 16 8.5" />
      <path d="M3 14 C3 15.5 4.5 17 6 17 L14 17 C15.5 17 17 15.5 17 14" />

      {/* Three coins above hand */}
      <circle cx="7" cy="4" r="1.5" />
      <circle cx="10" cy="3" r="1.5" />
      <circle cx="13" cy="4" r="1.5" />
    </svg>
  )
}
