/**
 * Admin Index Payments API
 *
 * Endpoint for triggering the payment indexer via external cron or manual sync.
 * Secured with API key authentication (for cron services).
 *
 * POST /api/admin/index-payments
 * Headers: x-api-key: ADMIN_INDEX_API_KEY
 *
 * Also supports admin cookie auth for manual "Sync Now" button in dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/admin/auth";
import { runIndexer, getLastSyncTime } from "@/lib/admin/indexer";
import { runAggregation } from "@/lib/admin/aggregation";

const ADMIN_INDEX_API_KEY = process.env.ADMIN_INDEX_API_KEY;

/**
 * Verify request is authorized via either:
 * 1. API key header (for external cron services)
 * 2. Admin cookie (for dashboard "Sync Now" button)
 */
async function isAuthorized(request: NextRequest): Promise<boolean> {
  // Check API key first (for cron)
  const apiKey = request.headers.get("x-api-key");
  if (apiKey && ADMIN_INDEX_API_KEY && apiKey === ADMIN_INDEX_API_KEY) {
    return true;
  }

  // Fall back to cookie auth (for dashboard)
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      return true;
    }
  }

  return false;
}

/**
 * POST - Run the indexer
 */
export async function POST(request: NextRequest) {
  // Verify authorization
  if (!(await isAuthorized(request))) {
    return NextResponse.json(
      { error: "Unauthorized - provide x-api-key header or admin cookie" },
      { status: 401 }
    );
  }

  try {
    // Parse optional parameters
    let fromBlock: number | undefined;
    let fullAggregation = false;
    let aggregationOnly = false;

    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 0) {
      try {
        const body = await request.json();
        if (body.fromBlock !== undefined && typeof body.fromBlock === "number") {
          fromBlock = body.fromBlock;
          console.log(`[Index Payments API] Force re-indexing from block ${fromBlock}`);
        }
        if (body.fullAggregation === true) {
          fullAggregation = true;
          console.log("[Index Payments API] Full aggregation requested");
        }
        if (body.aggregationOnly === true) {
          aggregationOnly = true;
          console.log("[Index Payments API] Aggregation only mode");
        }
      } catch {
        // Invalid JSON - use default behavior
      }
    }

    // Skip indexing if aggregationOnly mode
    let result: { success: boolean; indexed: number; fromBlock: number; toBlock: number; lastBlock: number; duration: number; error?: string } = { success: true, indexed: 0, fromBlock: 0, toBlock: 0, lastBlock: 0, duration: 0 };

    if (!aggregationOnly) {
      console.log("[Index Payments API] Starting indexer...");
      result = await runIndexer({ fromBlock });

      if (!result.success) {
        console.error("[Index Payments API] Indexer failed:", result.error);
        return NextResponse.json(
          { error: result.error || "Indexer failed" },
          { status: 500 }
        );
      }

      console.log(`[Index Payments API] Indexed ${result.indexed} payments in ${result.duration}ms`);
    } else {
      console.log("[Index Payments API] Skipping indexer (aggregation only mode)");
    }

    // Run aggregation to update all dashboard stats
    // This ensures daily_stats, aggregator_stats, token_stats, and users tables are in sync
    console.log(`[Index Payments API] Running aggregation (full: ${fullAggregation})...`);
    const aggregationResult = await runAggregation({
      days: 1,
      full: fullAggregation
    });

    if (aggregationResult.success) {
      console.log(
        `[Index Payments API] Aggregation complete in ${aggregationResult.duration}ms - ` +
          `daily: ${aggregationResult.dailyStatsUpdated}, aggregator: ${aggregationResult.aggregatorStatsUpdated}, ` +
          `token: ${aggregationResult.tokenStatsUpdated}, users: ${aggregationResult.usersUpdated}`
      );
    } else {
      console.error("[Index Payments API] Aggregation failed:", aggregationResult.error);
      // Don't fail the whole request - indexing succeeded, just log the error
    }

    return NextResponse.json({
      success: true,
      indexed: result.indexed,
      fromBlock: result.fromBlock,
      toBlock: result.toBlock,
      lastBlock: result.lastBlock,
      duration: result.duration,
      syncedAt: new Date().toISOString(),
      aggregationOnly,
      fullAggregation,
      aggregation: {
        success: aggregationResult.success,
        dailyStatsUpdated: aggregationResult.dailyStatsUpdated,
        aggregatorStatsUpdated: aggregationResult.aggregatorStatsUpdated,
        tokenStatsUpdated: aggregationResult.tokenStatsUpdated,
        usersUpdated: aggregationResult.usersUpdated,
        duration: aggregationResult.duration,
        error: aggregationResult.error,
      },
    });

  } catch (error) {
    console.error("[Index Payments API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET - Get last sync status (no auth required for status check)
 */
export async function GET() {
  try {
    const lastSync = await getLastSyncTime();

    return NextResponse.json({
      lastSync: lastSync.timestamp,
      lastBlock: lastSync.blockNumber,
    });
  } catch (error) {
    console.error("[Index Payments API] Error getting status:", error);
    return NextResponse.json(
      { lastSync: null, lastBlock: 0, error: "Failed to get sync status" },
      { status: 500 }
    );
  }
}
