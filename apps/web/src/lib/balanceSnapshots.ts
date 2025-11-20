/**
 * Balance Snapshots - Local Storage Utilities
 *
 * Tracks portfolio USD value over time to calculate 24h change.
 * Uses localStorage to persist snapshots across sessions.
 *
 * Storage format:
 * {
 *   "pragma.balance-snapshots.v1": {
 *     "0xabc...123": [
 *       { v: 1234.56, t: 1700000000000 },
 *       { v: 1240.12, t: 1700003600000 }
 *     ]
 *   }
 * }
 */

const STORAGE_KEY = 'pragma.balance-snapshots.v1'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const HOUR_MS = 60 * 60 * 1000 // 1 hour

interface BalanceSnapshot {
  v: number // USD value
  t: number // timestamp (ms)
}

interface SnapshotStorage {
  [walletAddress: string]: BalanceSnapshot[]
}

/**
 * Get all snapshots from localStorage
 */
function getStorage(): SnapshotStorage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch (err) {
    console.error('[BalanceSnapshots] Failed to read from localStorage:', err)
    return {}
  }
}

/**
 * Save snapshots to localStorage
 */
function setStorage(data: SnapshotStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (err) {
    console.error('[BalanceSnapshots] Failed to write to localStorage:', err)
  }
}

/**
 * Save a new balance snapshot for a wallet
 * Automatically deduplicates snapshots within the same hour
 */
export function saveBalanceSnapshot(address: string, usdValue: number): void {
  if (!address || usdValue < 0) return

  const now = Date.now()
  const storage = getStorage()
  const snapshots = storage[address] || []

  // Check if we already have a snapshot from this hour
  // This prevents cluttering storage with too many snapshots
  // BUT: Always keep at least 2 snapshots so we can calculate change
  const lastSnapshot = snapshots[snapshots.length - 1]
  if (lastSnapshot && now - lastSnapshot.t < HOUR_MS && snapshots.length > 1) {
    // Only deduplicate if we have MORE than 1 snapshot
    // This ensures we always keep at least 2 snapshots for change calculation
    lastSnapshot.v = usdValue
    lastSnapshot.t = now
  } else {
    // Add new snapshot (first one, more than 1h old, or only 1 snapshot exists)
    snapshots.push({ v: usdValue, t: now })
  }

  storage[address] = snapshots
  setStorage(storage)

  // Auto-cleanup old snapshots
  cleanupOldSnapshots(address)
}

/**
 * Get percentage change for a wallet from oldest available snapshot
 * Shows change immediately, doesn't require 24h of data
 * Returns 0 if insufficient data (need at least 2 snapshots)
 */
export function get24hChange(address: string): number {
  if (!address) return 0

  const storage = getStorage()
  const snapshots = storage[address]

  if (!snapshots || snapshots.length < 2) {
    return 0 // Need at least 2 snapshots to calculate change
  }

  // Get current value (most recent snapshot)
  const currentSnapshot = snapshots[snapshots.length - 1]
  const currentValue = currentSnapshot.v

  // Try to find snapshot closest to 24h ago, otherwise use oldest available
  const now = Date.now()
  const target24hAgo = now - 24 * 60 * 60 * 1000

  let comparisonSnapshot = snapshots[0] // Default to oldest
  let minDiff = Infinity

  for (const snapshot of snapshots) {
    const diff = Math.abs(snapshot.t - target24hAgo)
    if (diff < minDiff) {
      minDiff = diff
      comparisonSnapshot = snapshot
    }
  }

  const oldValue = comparisonSnapshot.v

  // Handle edge case: old value is 0
  if (oldValue === 0) {
    return currentValue > 0 ? 100 : 0
  }

  // Calculate percentage change
  const change = ((currentValue - oldValue) / oldValue) * 100

  // Round to 1 decimal place
  return Math.round(change * 10) / 10
}

/**
 * Remove snapshots older than MAX_AGE_MS (7 days)
 */
export function cleanupOldSnapshots(address: string): void {
  if (!address) return

  const storage = getStorage()
  const snapshots = storage[address]

  if (!snapshots || snapshots.length === 0) return

  const cutoff = Date.now() - MAX_AGE_MS

  // Filter out old snapshots
  const filtered = snapshots.filter((s) => s.t >= cutoff)

  if (filtered.length !== snapshots.length) {
    storage[address] = filtered
    setStorage(storage)
  }
}

/**
 * Clear all snapshots for a wallet (useful for testing)
 */
export function clearSnapshots(address: string): void {
  if (!address) return

  const storage = getStorage()
  delete storage[address]
  setStorage(storage)
}

/**
 * Get snapshot count for debugging
 */
export function getSnapshotCount(address: string): number {
  if (!address) return 0

  const storage = getStorage()
  const snapshots = storage[address]

  return snapshots ? snapshots.length : 0
}
