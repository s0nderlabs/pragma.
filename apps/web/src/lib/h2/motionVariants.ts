/**
 * Motion Variants for H2 Activity Animations
 *
 * Centralized animation configurations following Dieter Rams aesthetic:
 * - Minimal: Only purposeful animations
 * - Natural: Spring physics over linear easing
 * - Fast: Under 300ms for all transitions
 * - Accessible: Respects prefers-reduced-motion
 */

import type { Variants, Transition } from 'framer-motion'

// ============================================================================
// Activity Card Animations
// ============================================================================

/**
 * Activity card variants for slide-in, hover, and exit
 */
export const activityCardVariants: Variants = {
  initial: {
    opacity: 0,
    x: 20, // Start 20px to the right
  },
  animate: {
    opacity: 1,
    x: 0, // Slide to natural position
  },
  exit: {
    opacity: 0,
    x: -20, // Exit to the left
  },
  hover: {
    y: -2, // Subtle 2px lift on hover
  },
}

// ============================================================================
// Modal Animations
// ============================================================================

/**
 * Modal overlay backdrop animation
 */
export const modalOverlayVariants: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
  },
  exit: {
    opacity: 0,
  },
}

/**
 * Modal content entrance/exit animation
 * Slight scale + Y offset creates depth perception
 */
export const modalContentVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.96,
    y: 8, // Slight downward offset
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    scale: 0.98, // Less dramatic scale on exit
    y: -4, // Slight upward offset
  },
}

/**
 * Modal sections container - orchestrates stagger
 */
export const modalContainerVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08, // 80ms between sections
      delayChildren: 0.05, // Wait 50ms after modal entrance
    },
  },
}

/**
 * Individual modal section animation
 * Used for Operation, Transaction, Delegations sections
 */
export const modalSectionVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 10, // Start 10px below
  },
  visible: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: -5, // Slide up slightly on exit
  },
}

/**
 * Container for rows within a modal section
 * Orchestrates stagger for detail rows (From, To, Hash, Block, etc.)
 */
export const modalSectionRowsVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06, // 60ms between rows (more noticeable)
      delayChildren: 0.02,   // Wait 20ms after section appears
    },
  },
}

/**
 * Individual row animation within a section
 * Fade + slide from RIGHT for smooth reveal
 */
export const modalRowVariants: Variants = {
  hidden: {
    opacity: 0,
    x: 12, // Start 12px to the right (more pronounced)
  },
  visible: {
    opacity: 1,
    x: 0,
  },
}

// ============================================================================
// Spring Transition Presets
// ============================================================================

/**
 * Spring physics presets for natural motion
 * Higher stiffness = snappier, lower damping = bouncier
 */
export const springTransition = {
  /**
   * Fast, snappy animation for immediate feedback
   * Use for: Buttons, small UI elements
   */
  fast: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 35,
  },

  /**
   * Medium speed with balanced feel
   * Use for: Activity cards, list items
   */
  medium: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30,
  },

  /**
   * Smooth, elegant motion
   * Use for: Modal sections, content reveal
   */
  smooth: {
    type: 'spring' as const,
    stiffness: 350,
    damping: 30,
  },
} satisfies Record<string, Transition>

// ============================================================================
// Timing Constants
// ============================================================================

/**
 * Stagger delays for sequential animations
 */
export const staggerDelays = {
  /** Delay between activity cards appearing (30ms) */
  activityCard: 0.03,

  /** Delay between modal sections (80ms) */
  modalSection: 0.08,

  /** Delay between delegation items (50ms) */
  delegationItem: 0.05,
} as const

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get transition with optional stagger delay
 */
export function getStaggeredTransition(
  preset: keyof typeof springTransition,
  index: number,
  delayPerItem: number
): Transition {
  return {
    ...springTransition[preset],
    delay: index * delayPerItem,
  }
}

/**
 * Get disabled transition for reduced motion preference
 */
export const disabledTransition: Transition = {
  duration: 0,
  delay: 0,
}
