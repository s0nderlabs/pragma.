/**
 * Admin Dashboard Aggregation Module
 *
 * Aggregates validated_payments into daily_stats, aggregator_stats, token_stats, and users tables.
 * Called automatically after indexing to keep all dashboard components in sync.
 */

import { getSupabaseAdmin } from "./supabase";

// ============================================================================
// Types
// ============================================================================

interface AggregationOptions {
  days?: number; // Number of days to aggregate (default: 1 for quick sync)
  full?: boolean; // Full recompute from beginning
}

interface AggregationResult {
  success: boolean;
  dailyStatsUpdated: number;
  aggregatorStatsUpdated: number;
  tokenStatsUpdated: number;
  usersUpdated: number;
  duration: number;
  error?: string;
}

// ============================================================================
// Aggregation Functions
// ============================================================================

/**
 * Aggregate daily stats from validated_payments
 */
async function aggregateDailyStats(startDate: Date, endDate: Date): Promise<number> {
  const supabase = getSupabaseAdmin();

  // Get all payments in date range
  // Include tx_hash to count unique transactions (0x swaps have 2 rows per tx)
  const { data: payments, error } = await supabase
    .from("validated_payments")
    .select("tx_hash, delegator, volume_usd, fee_usd, timestamp")
    .gte("timestamp", startDate.toISOString())
    .lte("timestamp", endDate.toISOString())
    .order("timestamp", { ascending: true });

  if (error) {
    console.error("[Aggregation] Error fetching payments:", error);
    throw error;
  }

  if (!payments || payments.length === 0) {
    console.log("[Aggregation] No payments to aggregate");
    return 0;
  }

  // Get first tx per user (to identify new transactors)
  const { data: userFirstTx } = await supabase
    .from("users")
    .select("address, first_tx_at");

  const firstTxMap = new Map<string, Date>();
  if (userFirstTx) {
    for (const u of userFirstTx) {
      if (u.first_tx_at) {
        firstTxMap.set(u.address.toLowerCase(), new Date(u.first_tx_at));
      }
    }
  }

  // Group by date
  interface DailyData {
    date: string;
    active_users: number;
    tx_count: number;
    volume_usd: number;
    fees_usd: number;
    new_transactors: number;
  }

  const dailyStats = new Map<string, DailyData>();
  const usersByDate = new Map<string, Set<string>>();
  const txHashesByDate = new Map<string, Set<string>>();

  for (const p of payments) {
    const date = p.timestamp.split("T")[0];
    const delegator = p.delegator.toLowerCase();
    const txHash = p.tx_hash;

    if (!dailyStats.has(date)) {
      dailyStats.set(date, {
        date,
        active_users: 0,
        tx_count: 0,
        volume_usd: 0,
        fees_usd: 0,
        new_transactors: 0,
      });
      usersByDate.set(date, new Set());
      txHashesByDate.set(date, new Set());
    }

    const stats = dailyStats.get(date)!;
    const users = usersByDate.get(date)!;
    const txHashes = txHashesByDate.get(date)!;

    // Count unique transactions (0x swaps have 2 rows per tx)
    if (!txHashes.has(txHash)) {
      txHashes.add(txHash);
      stats.tx_count = txHashes.size;
    }

    // Always accumulate volume and fees (both pragma and 0x fees are real)
    stats.volume_usd += Number(p.volume_usd) || 0;
    stats.fees_usd += Number(p.fee_usd) || 0;

    if (!users.has(delegator)) {
      users.add(delegator);
      stats.active_users = users.size;

      // Check if this is their first tx
      const firstTx = firstTxMap.get(delegator);
      if (firstTx && firstTx.toISOString().split("T")[0] === date) {
        stats.new_transactors += 1;
      }
    }
  }

  // Get new account deployments per day
  const { data: deployments } = await supabase
    .from("account_deployments")
    .select("created_at")
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  const deploymentsByDate = new Map<string, number>();
  if (deployments) {
    for (const d of deployments) {
      const date = d.created_at.split("T")[0];
      deploymentsByDate.set(date, (deploymentsByDate.get(date) || 0) + 1);
    }
  }

  // Upsert daily stats
  const records = Array.from(dailyStats.values()).map((s) => ({
    date: s.date,
    active_users: s.active_users,
    tx_count: s.tx_count,
    volume_usd: s.volume_usd,
    fees_usd: s.fees_usd,
    new_transactors: s.new_transactors,
    new_accounts: deploymentsByDate.get(s.date) || 0,
    updated_at: new Date().toISOString(),
  }));

  if (records.length > 0) {
    const { error: upsertError } = await supabase
      .from("daily_stats")
      .upsert(records, { onConflict: "date" });

    if (upsertError) {
      console.error("[Aggregation] Error upserting daily_stats:", upsertError);
      throw upsertError;
    }
  }

  return records.length;
}

/**
 * Aggregate stats by source (pragma, 0x, monorail)
 */
async function aggregateAggregatorStats(startDate: Date, endDate: Date): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data: payments, error } = await supabase
    .from("validated_payments")
    .select("tx_hash, timestamp, volume_usd, fee_usd, source")
    .gte("timestamp", startDate.toISOString())
    .lte("timestamp", endDate.toISOString());

  if (error || !payments) {
    console.error("[Aggregation] Error fetching payments:", error);
    return 0;
  }

  // Group by date AND source, tracking unique tx_hash per group
  const statsByDateSource = new Map<
    string,
    {
      date: string;
      source: string;
      txHashes: Set<string>; // Track unique tx hashes
      volume_usd: number;
      fees_usd: number;
    }
  >();

  for (const p of payments) {
    const date = p.timestamp.split("T")[0];
    const source = p.source || "pragma";
    const key = `${date}:${source}`;

    if (!statsByDateSource.has(key)) {
      statsByDateSource.set(key, {
        date,
        source,
        txHashes: new Set<string>(),
        volume_usd: 0,
        fees_usd: 0,
      });
    }

    const stats = statsByDateSource.get(key)!;
    // Use Set to count unique transactions (0x swaps have 2 rows per tx)
    stats.txHashes.add(p.tx_hash);
    stats.volume_usd += Number(p.volume_usd) || 0;
    stats.fees_usd += Number(p.fee_usd) || 0;
  }

  const records = Array.from(statsByDateSource.values()).map((stats) => ({
    date: stats.date,
    aggregator: stats.source,
    tx_count: stats.txHashes.size, // Count unique transactions
    volume_usd: stats.volume_usd,
    fees_usd: stats.fees_usd,
  }));

  if (records.length > 0) {
    const { error: upsertError } = await supabase
      .from("aggregator_stats")
      .upsert(records, { onConflict: "date,aggregator" });

    if (upsertError) {
      console.error("[Aggregation] Error upserting aggregator_stats:", upsertError);
    }
  }

  return records.length;
}

/**
 * Aggregate stats by token
 */
async function aggregateTokenStats(startDate: Date, endDate: Date): Promise<number> {
  const supabase = getSupabaseAdmin();

  // Include tx_hash to count unique transactions (0x swaps have 2 rows per tx)
  const { data: payments, error } = await supabase
    .from("validated_payments")
    .select("tx_hash, timestamp, token, volume_usd, fee_usd")
    .gte("timestamp", startDate.toISOString())
    .lte("timestamp", endDate.toISOString());

  if (error || !payments) {
    console.error("[Aggregation] Error fetching payments:", error);
    return 0;
  }

  // Get unique tokens
  const uniqueTokens = [...new Set(payments.map((p) => p.token.toLowerCase()))];

  // Fetch symbols from Monorail API
  const MONORAIL_API = process.env.NEXT_PUBLIC_MONORAIL_DATA_API_URL || "https://api.monorail.xyz/v2";
  const tokenSymbols = new Map<string, string>();

  for (const token of uniqueTokens) {
    try {
      const response = await fetch(`${MONORAIL_API}/token/${token}`);
      if (response.ok) {
        const data = await response.json();
        if (data.symbol) {
          tokenSymbols.set(token, data.symbol);
        }
      }
    } catch {
      // Ignore fetch errors
    }
  }

  // Group by date + token
  const statsByKey = new Map<
    string,
    { date: string; token: string; tx_count: number; volume_usd: number; fees_usd: number }
  >();
  const txHashesByKey = new Map<string, Set<string>>();

  for (const p of payments) {
    const date = p.timestamp.split("T")[0];
    const token = p.token.toLowerCase();
    const key = `${date}:${token}`;
    const txHash = p.tx_hash;

    if (!statsByKey.has(key)) {
      statsByKey.set(key, { date, token, tx_count: 0, volume_usd: 0, fees_usd: 0 });
      txHashesByKey.set(key, new Set());
    }

    const stats = statsByKey.get(key)!;
    const txHashes = txHashesByKey.get(key)!;

    // Count unique transactions (0x swaps have 2 rows per tx)
    if (!txHashes.has(txHash)) {
      txHashes.add(txHash);
      stats.tx_count = txHashes.size;
    }

    // Always accumulate volume and fees
    stats.volume_usd += Number(p.volume_usd) || 0;
    stats.fees_usd += Number(p.fee_usd) || 0;
  }

  const records = Array.from(statsByKey.values()).map((s) => ({
    date: s.date,
    token_address: s.token,
    token_symbol: tokenSymbols.get(s.token) || null,
    tx_count: s.tx_count,
    volume_usd: s.volume_usd,
    fees_usd: s.fees_usd,
  }));

  if (records.length > 0) {
    const { error: upsertError } = await supabase
      .from("token_stats")
      .upsert(records, { onConflict: "date,token_address" });

    if (upsertError) {
      console.error("[Aggregation] Error upserting token_stats:", upsertError);
    }
  }

  return records.length;
}

/**
 * Update user stats (tx_count, volume, fees, active_days)
 */
async function updateUserStats(): Promise<number> {
  const supabase = getSupabaseAdmin();

  // Include tx_hash to count unique transactions (0x swaps have 2 rows per tx)
  const { data: payments, error } = await supabase
    .from("validated_payments")
    .select("tx_hash, delegator, timestamp, volume_usd, fee_usd");

  if (error || !payments) {
    console.error("[Aggregation] Error fetching payments:", error);
    return 0;
  }

  interface UserStats {
    txHashes: Set<string>;
    volume_usd: number;
    fee_usd: number;
    days: Set<string>;
    first_tx_at: string;
    last_tx_at: string;
  }

  const userStats = new Map<string, UserStats>();

  for (const p of payments) {
    const delegator = p.delegator.toLowerCase();
    const date = p.timestamp.split("T")[0];
    const txHash = p.tx_hash;

    if (!userStats.has(delegator)) {
      userStats.set(delegator, {
        txHashes: new Set(),
        volume_usd: 0,
        fee_usd: 0,
        days: new Set(),
        first_tx_at: p.timestamp,
        last_tx_at: p.timestamp,
      });
    }

    const stats = userStats.get(delegator)!;
    stats.txHashes.add(txHash);
    stats.volume_usd += Number(p.volume_usd) || 0;
    stats.fee_usd += Number(p.fee_usd) || 0;
    stats.days.add(date);

    if (p.timestamp < stats.first_tx_at) {
      stats.first_tx_at = p.timestamp;
    }
    if (p.timestamp > stats.last_tx_at) {
      stats.last_tx_at = p.timestamp;
    }
  }

  const records = Array.from(userStats.entries()).map(([address, stats]) => ({
    address,
    tx_count: stats.txHashes.size, // Count unique transactions
    total_volume_usd: stats.volume_usd,
    total_fees_usd: stats.fee_usd,
    active_days: stats.days.size,
    first_tx_at: stats.first_tx_at,
    last_tx_at: stats.last_tx_at,
    updated_at: new Date().toISOString(),
  }));

  if (records.length > 0) {
    const { error: upsertError } = await supabase
      .from("users")
      .upsert(records, { onConflict: "address", ignoreDuplicates: false });

    if (upsertError) {
      console.error("[Aggregation] Error upserting users:", upsertError);
    }
  }

  return records.length;
}

// ============================================================================
// Main Aggregation Function
// ============================================================================

/**
 * Run all aggregations
 *
 * @param options - Aggregation options
 * @returns Aggregation result with counts and timing
 */
export async function runAggregation(options: AggregationOptions = {}): Promise<AggregationResult> {
  const startTime = Date.now();
  const { days = 1, full = false } = options;

  console.log(`[Aggregation] Starting aggregation (days: ${full ? "full" : days})`);

  try {
    const endDate = new Date();
    let startDate: Date;

    if (full) {
      startDate = new Date(0); // From beginning
    } else {
      startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    }

    // Run all aggregations
    const dailyStatsUpdated = await aggregateDailyStats(startDate, endDate);
    const aggregatorStatsUpdated = await aggregateAggregatorStats(startDate, endDate);
    const tokenStatsUpdated = await aggregateTokenStats(startDate, endDate);
    const usersUpdated = await updateUserStats();

    const duration = Date.now() - startTime;

    console.log(
      `[Aggregation] Complete in ${duration}ms - ` +
        `daily: ${dailyStatsUpdated}, aggregator: ${aggregatorStatsUpdated}, ` +
        `token: ${tokenStatsUpdated}, users: ${usersUpdated}`
    );

    return {
      success: true,
      dailyStatsUpdated,
      aggregatorStatsUpdated,
      tokenStatsUpdated,
      usersUpdated,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("[Aggregation] Error:", error);

    return {
      success: false,
      dailyStatsUpdated: 0,
      aggregatorStatsUpdated: 0,
      tokenStatsUpdated: 0,
      usersUpdated: 0,
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
