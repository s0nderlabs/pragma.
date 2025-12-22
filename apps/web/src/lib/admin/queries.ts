/**
 * Admin Dashboard Database Queries
 *
 * All Supabase queries for the admin dashboard.
 * Uses service role for writes, anon key for reads.
 */

import {
  getSupabaseAdmin,
  getSupabaseClient,
  type User,
  type ValidatedPayment,
  type DailyStats,
  type AggregatorStats,
  type TokenStats,
  type Campaign,
  type AISummary,
  type LeaderboardEntry,
  type AccountDeployment,
} from "./supabase";

// ============================================================================
// Overview Stats
// ============================================================================

export interface OverviewStats {
  totalUsers: number;
  totalDeployed: number; // Onboarded accounts (deployed smart accounts)
  totalVolume: number;
  totalRevenue: number;
  totalTransactions: number;
  users24h: number;
  deployed24h: number;
  volume24h: number;
  revenue24h: number;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const supabase = getSupabaseClient();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().split("T")[0];

  // Use aggregated tables and efficient queries instead of loading all records

  // 1. Get totals from daily_stats (pre-aggregated)
  const { data: dailyTotals } = await supabase
    .from("daily_stats")
    .select("volume_usd, fees_usd, tx_count, active_users");

  let totalVolume = 0;
  let totalRevenue = 0;
  let totalTransactions = 0;
  if (dailyTotals) {
    for (const d of dailyTotals) {
      totalVolume += Number(d.volume_usd) || 0;
      totalRevenue += Number(d.fees_usd) || 0;
      totalTransactions += d.tx_count || 0;
    }
  }

  // 2. Get total unique users from users table (efficient count)
  const { count: totalUsers } = await supabase
    .from("users")
    .select("address", { count: "exact", head: true })
    .gt("tx_count", 0);

  // 3. Get total deployed accounts
  // Count from account_deployments table
  const { count: deploymentsCount } = await supabase
    .from("account_deployments")
    .select("id", { count: "exact", head: true });

  // Also count all users (anyone who transacted must have deployed)
  const { count: usersCount } = await supabase
    .from("users")
    .select("address", { count: "exact", head: true });

  // Onboarded = MAX of (explicit deployments, all users with any record)
  // Because: users who transacted must have deployed, even if not in account_deployments
  const totalDeployed = Math.max(deploymentsCount || 0, usersCount || 0);

  // 4. Get 24h stats from daily_stats for today
  const { data: todayStats } = await supabase
    .from("daily_stats")
    .select("volume_usd, fees_usd, active_users")
    .eq("date", todayStr)
    .single();

  const volume24h = Number(todayStats?.volume_usd) || 0;
  const revenue24h = Number(todayStats?.fees_usd) || 0;
  const users24h = todayStats?.active_users || 0;

  // 5. Get 24h deployments count
  const { count: deployed24h } = await supabase
    .from("account_deployments")
    .select("id", { count: "exact", head: true })
    .gte("created_at", yesterday.toISOString());

  return {
    totalUsers: totalUsers || 0,
    totalDeployed: totalDeployed || 0,
    totalVolume,
    totalRevenue,
    totalTransactions,
    users24h,
    deployed24h: deployed24h || 0,
    volume24h,
    revenue24h,
  };
}

// ============================================================================
// Users Queries
// ============================================================================

export interface UsersListParams {
  page?: number;
  limit?: number;
  search?: string;
  filter?: "all" | "flagged" | "high_volume" | "new";
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  activeOnly?: boolean; // Filter to users with tx_count > 0
}

export interface UsersListResult {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

export async function getUsers(params: UsersListParams = {}): Promise<UsersListResult> {
  const supabase = getSupabaseClient();
  const {
    page = 1,
    limit = 50,
    search,
    filter = "all",
    sortBy = "total_volume_usd",
    sortOrder = "desc",
    activeOnly = true, // Default to showing only active users
  } = params;

  let query = supabase
    .from("users")
    .select("*", { count: "exact" });

  // Filter to active users (tx_count > 0) unless showing all
  if (activeOnly) {
    query = query.gt("tx_count", 0);
  }

  // Apply filters
  if (search) {
    query = query.or(`address.ilike.%${search}%,eoa_address.ilike.%${search}%`);
  }

  if (filter === "flagged") {
    query = query.eq("is_flagged", true);
  } else if (filter === "high_volume") {
    query = query.gte("total_volume_usd", 1000);
  } else if (filter === "new") {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    query = query.gte("created_at", weekAgo.toISOString());
  }

  // Apply sorting
  query = query.order(sortBy, { ascending: sortOrder === "asc" });

  // Apply pagination
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error("[Queries] getUsers error:", error);
    throw error;
  }

  return {
    users: (data as User[]) || [],
    total: count || 0,
    page,
    limit,
  };
}

export async function getUserByAddress(address: string): Promise<User | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("address", address.toLowerCase())
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    console.error("[Queries] getUserByAddress error:", error);
    throw error;
  }

  return data as User;
}

export async function updateUserFlag(
  address: string,
  flagStatus: "legitimate" | "excluded"
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("users")
    .update({
      flag_status: flagStatus,
      is_flagged: flagStatus === "excluded",
      updated_at: new Date().toISOString(),
    })
    .eq("address", address.toLowerCase());

  if (error) {
    console.error("[Queries] updateUserFlag error:", error);
    throw error;
  }
}

// ============================================================================
// Payments Queries
// ============================================================================

export interface PaymentsListParams {
  page?: number;
  limit?: number;
  delegator?: string;
  startDate?: Date;
  endDate?: Date;
  source?: "pragma" | "0x"; // Filter by source (default: pragma for activity feeds)
}

export interface PaymentsListResult {
  payments: ValidatedPayment[];
  total: number;
  page: number;
  limit: number;
}

export async function getPayments(params: PaymentsListParams = {}): Promise<PaymentsListResult> {
  const supabase = getSupabaseClient();
  const { page = 1, limit = 50, delegator, startDate, endDate, source = "pragma" } = params;

  let query = supabase
    .from("validated_payments")
    .select("*", { count: "exact" })
    .eq("source", source) // Filter by source (default: pragma to show records with volume)
    .order("timestamp", { ascending: false });

  if (delegator) {
    query = query.eq("delegator", delegator.toLowerCase());
  }

  if (startDate) {
    query = query.gte("timestamp", startDate.toISOString());
  }

  if (endDate) {
    query = query.lte("timestamp", endDate.toISOString());
  }

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error("[Queries] getPayments error:", error);
    throw error;
  }

  return {
    payments: (data as ValidatedPayment[]) || [],
    total: count || 0,
    page,
    limit,
  };
}

// ============================================================================
// Leaderboard Queries
// ============================================================================

export interface LeaderboardParams {
  page?: number;
  limit?: number;
  startDate?: Date;
  endDate?: Date;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  total: number;
  eligibleCount: number;
}

export async function getLeaderboard(params: LeaderboardParams = {}): Promise<LeaderboardResult> {
  const supabase = getSupabaseClient();
  const { page = 1, limit = 100 } = params;

  const { data, count, error } = await supabase
    .from("leaderboard")
    .select("*", { count: "exact" })
    .range((page - 1) * limit, page * limit - 1);

  if (error) {
    console.error("[Queries] getLeaderboard error:", error);
    throw error;
  }

  const entries = (data as LeaderboardEntry[]) || [];
  const eligibleCount = entries.filter((e) => e.status === "eligible").length;

  return {
    entries,
    total: count || 0,
    eligibleCount,
  };
}

// ============================================================================
// Daily Stats Queries
// ============================================================================

/**
 * Fill missing dates with zero values to ensure continuous timeline
 */
function fillMissingDates(data: DailyStats[], days: number): DailyStats[] {
  const result: DailyStats[] = [];
  const dataMap = new Map(data.map((d) => [d.date, d]));
  const endDate = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(endDate.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split("T")[0];

    if (dataMap.has(dateStr)) {
      result.push(dataMap.get(dateStr)!);
    } else {
      // Fill with zero values for missing dates
      result.push({
        date: dateStr,
        new_accounts: 0,
        new_transactors: 0,
        active_users: 0,
        tx_count: 0,
        volume_usd: 0,
        fees_usd: 0,
        updated_at: new Date().toISOString(),
      });
    }
  }
  return result;
}

export async function getDailyStats(days: number = 30): Promise<DailyStats[]> {
  const supabase = getSupabaseClient();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("daily_stats")
    .select("*")
    .gte("date", startDate.toISOString().split("T")[0])
    .order("date", { ascending: true });

  if (error) {
    console.error("[Queries] getDailyStats error:", error);
    throw error;
  }

  // Fill missing dates with zeros to ensure continuous timeline
  return fillMissingDates((data as DailyStats[]) || [], days);
}

// ============================================================================
// Revenue Queries
// ============================================================================

export interface RevenueStats {
  totalRevenue: number;
  pragmaFees: number;
  aggregatorRevenue: number;
  byAggregator: AggregatorStats[];
  byToken: TokenStats[];
}

export async function getRevenueStats(days: number = 30): Promise<RevenueStats> {
  const supabase = getSupabaseClient();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const startDateStr = startDate.toISOString().split("T")[0];

  // Get aggregator stats
  const { data: aggData } = await supabase
    .from("aggregator_stats")
    .select("*")
    .gte("date", startDateStr)
    .order("date", { ascending: true });

  // Get token stats
  const { data: tokenData } = await supabase
    .from("token_stats")
    .select("*")
    .gte("date", startDateStr)
    .order("fees_usd", { ascending: false });

  const byAggregator = (aggData as AggregatorStats[]) || [];
  const byToken = (tokenData as TokenStats[]) || [];

  // Calculate totals
  let pragmaFees = 0;
  let aggregatorRevenue = 0;

  for (const stat of byAggregator) {
    if (stat.aggregator === "pragma") {
      pragmaFees += Number(stat.fees_usd) || 0;
    } else {
      aggregatorRevenue += Number(stat.fees_usd) || 0;
    }
  }

  return {
    totalRevenue: pragmaFees + aggregatorRevenue,
    pragmaFees,
    aggregatorRevenue,
    byAggregator,
    byToken,
  };
}

// ============================================================================
// Campaign Queries
// ============================================================================

export async function getActiveCampaign(): Promise<Campaign | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("is_active", true)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error("[Queries] getActiveCampaign error:", error);
    throw error;
  }

  return data as Campaign;
}

export async function createCampaign(campaign: Omit<Campaign, "id" | "created_at">): Promise<Campaign> {
  const supabase = getSupabaseAdmin();

  // Deactivate any existing active campaigns
  await supabase.from("campaigns").update({ is_active: false }).eq("is_active", true);

  const { data, error } = await supabase
    .from("campaigns")
    .insert(campaign)
    .select()
    .single();

  if (error) {
    console.error("[Queries] createCampaign error:", error);
    throw error;
  }

  return data as Campaign;
}

// ============================================================================
// AI Summary Queries
// ============================================================================

export async function getLatestSummary(): Promise<AISummary | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("ai_summaries")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error("[Queries] getLatestSummary error:", error);
    throw error;
  }

  return data as AISummary;
}

export async function saveSummary(
  summaryText: string,
  metricsSnapshot: Record<string, unknown>
): Promise<AISummary> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("ai_summaries")
    .insert({
      summary_text: summaryText,
      metrics_snapshot: metricsSnapshot,
    })
    .select()
    .single();

  if (error) {
    console.error("[Queries] saveSummary error:", error);
    throw error;
  }

  return data as AISummary;
}

// ============================================================================
// Account Deployments
// ============================================================================

export async function recordDeployment(deployment: {
  txHash: string;
  blockNumber?: number;
  eoaAddress: string;
  smartAccount: string;
  factoryAddress?: string;
  paymasterAddress?: string;
}): Promise<AccountDeployment> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("account_deployments")
    .insert({
      tx_hash: deployment.txHash,
      block_number: deployment.blockNumber,
      eoa_address: deployment.eoaAddress.toLowerCase(),
      smart_account: deployment.smartAccount.toLowerCase(),
      factory_address: deployment.factoryAddress,
      paymaster_address: deployment.paymasterAddress,
    })
    .select()
    .single();

  if (error) {
    // Handle duplicate key errors (already recorded) - fetch existing record
    if (error.code === "23505") {
      console.log("[Queries] Deployment already recorded:", deployment.txHash);
      // Fetch and return the existing record
      const { data: existingData } = await supabase
        .from("account_deployments")
        .select()
        .eq("tx_hash", deployment.txHash.toLowerCase())
        .single();

      if (existingData) {
        return existingData as AccountDeployment;
      }
      // Fallback: return properly structured object if fetch fails
      return {
        id: 0, // Unknown ID for existing record
        tx_hash: deployment.txHash,
        block_number: deployment.blockNumber || null,
        eoa_address: deployment.eoaAddress.toLowerCase(),
        smart_account: deployment.smartAccount.toLowerCase(),
        factory_address: deployment.factoryAddress || null,
        paymaster_address: deployment.paymasterAddress || null,
        created_at: new Date().toISOString(),
        indexed_at: new Date().toISOString(),
      };
    }
    console.error("[Queries] recordDeployment error:", error);
    throw error;
  }

  return data as AccountDeployment;
}

// ============================================================================
// Raw SQL Execution (for AI Chatbot)
// ============================================================================

export interface SqlQueryResult {
  data: Record<string, unknown>[] | null;
  error: string | null;
  rowCount: number;
}

/**
 * Execute a read-only SQL query for AI chatbot
 * IMPORTANT: Only SELECT queries are allowed
 */
export async function executeReadOnlyQuery(sql: string): Promise<SqlQueryResult> {
  // Validate query is read-only
  const normalizedSql = sql.trim().toLowerCase();

  const forbiddenKeywords = ["insert", "update", "delete", "drop", "create", "alter", "truncate", "grant", "revoke"];
  for (const keyword of forbiddenKeywords) {
    if (normalizedSql.includes(keyword)) {
      return {
        data: null,
        error: `Forbidden keyword: ${keyword}. Only SELECT queries are allowed.`,
        rowCount: 0,
      };
    }
  }

  if (!normalizedSql.startsWith("select")) {
    return {
      data: null,
      error: "Query must start with SELECT",
      rowCount: 0,
    };
  }

  const supabase = getSupabaseClient();

  try {
    // Use rpc to execute raw SQL (requires a Supabase function)
    // For now, we'll just return an error suggesting to use the API
    // In production, you'd create a Supabase function for this
    return {
      data: null,
      error: "Raw SQL execution not yet configured. Use the typed queries instead.",
      rowCount: 0,
    };
  } catch (error) {
    console.error("[Queries] executeReadOnlyQuery error:", error);
    return {
      data: null,
      error: String(error),
      rowCount: 0,
    };
  }
}
