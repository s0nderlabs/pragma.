/**
 * Admin Dashboard Library
 *
 * Re-exports all admin utilities for cleaner imports.
 */

// Supabase client and types
export {
  getSupabaseClient,
  getSupabaseAdmin,
  type ValidatedPayment,
  type User,
  type DailyStats,
  type AccountDeployment,
  type AggregatorStats,
  type TokenStats,
  type Campaign,
  type AISummary,
  type LeaderboardEntry,
} from "./supabase";

// Authentication
export {
  generateNonce,
  createSignMessage,
  verifyWalletAuth,
  verifyPasswordAuth,
  verifyToken,
  isValidToken,
  ADMIN_TOKEN_COOKIE,
  getTokenCookieOptions,
  type AdminToken,
  type AuthResult,
} from "./auth";

// Database queries
export {
  getOverviewStats,
  getUsers,
  getUserByAddress,
  updateUserFlag,
  getPayments,
  getLeaderboard,
  getDailyStats,
  getRevenueStats,
  getActiveCampaign,
  createCampaign,
  getLatestSummary,
  saveSummary,
  recordDeployment,
  executeReadOnlyQuery,
  type OverviewStats,
  type UsersListParams,
  type UsersListResult,
  type PaymentsListParams,
  type PaymentsListResult,
  type LeaderboardParams,
  type LeaderboardResult,
  type RevenueStats,
  type SqlQueryResult,
} from "./queries";
