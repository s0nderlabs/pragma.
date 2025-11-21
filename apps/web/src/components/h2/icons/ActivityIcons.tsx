/**
 * Activity Icons - Dieter Rams × Jony Ive Aesthetic
 *
 * Using Phosphor Icons with thin weight for minimal, refined appearance
 * Philosophy: "Less, but better" - only essential visual elements
 *
 * Design principles:
 * - Thin weight (most refined, minimal visual weight)
 * - Monochromatic (currentColor inheritance)
 * - Geometric purity (consistent optical sizing)
 * - Functional clarity (immediate recognition)
 */

import {
  ArrowsLeftRight,
  PaperPlaneTilt,
  Package,
  Gift,
  TrendUp,
  Hourglass,
  HandCoins,
  Wallet,
} from '@phosphor-icons/react'

interface IconProps {
  className?: string
}

/**
 * Swap Icon - Bidirectional exchange
 */
export function SwapIcon({ className }: IconProps) {
  return <ArrowsLeftRight weight="thin" size={20} className={className} />
}

/**
 * Transfer Icon - Sending to destination
 */
export function TransferIcon({ className }: IconProps) {
  return <PaperPlaneTilt weight="thin" size={20} className={className} />
}

/**
 * Wrap Icon - Enclosing/containing
 */
export function WrapIcon({ className }: IconProps) {
  return <Package weight="thin" size={20} className={className} />
}

/**
 * Unwrap Icon - Revealing/unwrapping
 */
export function UnwrapIcon({ className }: IconProps) {
  return <Gift weight="thin" size={20} className={className} />
}

/**
 * Stake Icon - Depositing/growing
 */
export function StakeIcon({ className }: IconProps) {
  return <TrendUp weight="thin" size={20} className={className} />
}

/**
 * Unstake Icon - Time-based withdrawal process
 */
export function UnstakeIcon({ className }: IconProps) {
  return <Hourglass weight="thin" size={20} className={className} />
}

/**
 * UnstakeClaim Icon - Receiving rewards
 */
export function UnstakeClaimIcon({ className }: IconProps) {
  return <HandCoins weight="thin" size={20} className={className} />
}

/**
 * Funding Icon - Session key funding
 */
export function FundingIcon({ className }: IconProps) {
  return <Wallet weight="thin" size={20} className={className} />
}
