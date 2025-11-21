/**
 * Delegation Helper Functions
 *
 * Decoders for function selectors and enforcer addresses
 * Used in ActivityDetailModal to show human-readable delegation details
 */

// Known function selectors (4-byte signatures)
export const FUNCTION_NAMES: Record<string, string> = {
  '0x095ea7b3': 'Approve',
  '0xf99cae99': 'Swap',
  '0xa9059cbb': 'Transfer',
  '0x23b872dd': 'Transfer From',
  '0xd0e30db0': 'Deposit',
  '0x2e1a7d4d': 'Withdraw',
  '0x18160ddd': 'Total Supply',
  '0x70a08231': 'Balance Of',
};

// Known enforcer contract addresses (Monad testnet)
export const ENFORCER_NAMES: Record<string, string> = {
  '0xde4f2fac4b3d87a1d9953ca5fc09fca7f366254f': 'Nonce',
  '0x1046bb45c8d673d4ea75321280db34899413c069': 'Time',
  '0x04658b29f6b82ed55274221a06fc97d318e25416': 'Limit',
  '0x2c21fd0cb9dc8445cb3fb0dc5e7bb0aca01842b5': 'Function',
  '0x7f20f61b1f09b08d970938f6fa563634d65c4eeb': 'Scope',
};

/**
 * Decode function selector to human-readable name
 * @param selector - 4-byte function selector (e.g., "0x095ea7b3")
 * @returns Human-readable function name or "Unknown"
 */
export function decodeFunctionName(selector: string): string {
  return FUNCTION_NAMES[selector.toLowerCase()] || 'Unknown';
}

/**
 * Get enforcer name from contract address
 * @param address - Enforcer contract address
 * @returns Human-readable enforcer name or "Custom"
 */
export function getEnforcerName(address: string): string {
  return ENFORCER_NAMES[address.toLowerCase()] || 'Custom';
}

/**
 * Shorten address for display (0x1234...5678)
 * @param address - Full address
 * @param prefixLen - Characters to show at start (default: 6)
 * @param suffixLen - Characters to show at end (default: 4)
 */
export function shortenAddress(
  address: string,
  prefixLen: number = 6,
  suffixLen: number = 4
): string {
  if (!address || address.length < prefixLen + suffixLen) return address;
  return `${address.slice(0, prefixLen)}...${address.slice(-suffixLen)}`;
}

/**
 * Format relative time (e.g., "5 minutes ago")
 * @param timestamp - Unix timestamp in seconds
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (absDiff < 60) return `in ${absDiff} seconds`;
    if (absDiff < 3600) return `in ${Math.floor(absDiff / 60)} minutes`;
    return `in ${Math.floor(absDiff / 3600)} hours`;
  }

  if (diff < 60) return `${diff} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}
