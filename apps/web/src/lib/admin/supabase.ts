/**
 * Supabase Client for Admin Dashboard
 *
 * Two clients:
 * - supabaseClient: Uses anon key, respects RLS (for AI chatbot read-only queries)
 * - supabaseAdmin: Uses service role key, bypasses RLS (for server-side writes)
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate environment
function validateEnv(): { url: string; anonKey: string; serviceRoleKey: string } {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL environment variable");
  }
  if (!SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE_ANON_KEY environment variable");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
  }
  return {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  };
}

// Lazy-initialized clients
let _supabaseClient: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

/**
 * Get Supabase client with anon key (respects RLS)
 * Use for read-only queries from AI chatbot
 */
export function getSupabaseClient(): SupabaseClient {
  if (!_supabaseClient) {
    const { url, anonKey } = validateEnv();
    _supabaseClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return _supabaseClient;
}

/**
 * Get Supabase admin client with service role key (bypasses RLS)
 * Use for server-side writes and admin operations
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const { url, serviceRoleKey } = validateEnv();
    _supabaseAdmin = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return _supabaseAdmin;
}

// ============================================================================
// Database Types
// ============================================================================

export interface ValidatedPayment {
  id: number;
  tx_hash: string;
  block_number: number;
  log_index: number;
  delegator: string;
  token: string;
  amount_wei: string;
  is_native: boolean;
  timestamp: string;
  token_price_usd: number | null;
  fee_usd: number | null;
  volume_usd: number | null;
  indexed_at: string;
  source?: "pragma" | "0x" | "monorail";
  action_type?: "swap" | "stake" | "unstake_request" | "unstake_claim" | "transfer" | "wrap" | "unwrap";
}

export interface User {
  address: string;
  eoa_address: string | null;
  created_at: string | null;
  first_tx_at: string | null;
  last_tx_at: string | null;
  tx_count: number;
  total_volume_usd: number;
  total_fees_usd: number;
  active_days: number;
  is_flagged: boolean;
  flag_reason: string | null;
  flag_status: "pending" | "legitimate" | "excluded" | null;
  updated_at: string;
}

export interface DailyStats {
  date: string;
  new_accounts: number;
  new_transactors: number;
  active_users: number;
  tx_count: number;
  volume_usd: number;
  fees_usd: number;
  updated_at: string;
}

export interface AccountDeployment {
  id: number;
  tx_hash: string;
  block_number: number | null;
  eoa_address: string;
  smart_account: string;
  factory_address: string | null;
  paymaster_address: string | null;
  created_at: string;
  indexed_at: string;
}

export interface AggregatorStats {
  date: string;
  aggregator: "pragma" | "monorail" | "0x";
  tx_count: number;
  volume_usd: number;
  fees_usd: number;
}

export interface TokenStats {
  date: string;
  token_address: string;
  token_symbol: string | null;
  tx_count: number;
  volume_usd: number;
  fees_usd: number;
}

export interface Campaign {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  target_users: number;
  target_volume_usd: number;
  target_transactions: number;
  target_retention_pct: number;
  pool_total_usd: number;
  pool_cashback_pct: number;
  pool_prizes_pct: number;
  is_active: boolean;
  created_at: string;
}

export interface AISummary {
  id: number;
  summary_text: string;
  metrics_snapshot: Record<string, unknown> | null;
  generated_at: string;
}

export interface LeaderboardEntry {
  address: string;
  eoa_address: string | null;
  tx_count: number;
  total_volume_usd: number;
  total_fees_usd: number;
  active_days: number;
  is_flagged: boolean;
  flag_status: string | null;
  projected_reward_usd: number;
  status: "eligible" | "review" | "excluded";
}
