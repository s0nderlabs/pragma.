/**
 * RAG API Route - Pinecone Vector Search
 *
 * Server-side endpoint for searching indexed protocol documentation.
 * Called by searchProtocolDocsTool during H2 agent execution.
 *
 * Security: Accepts EITHER:
 * 1. Internal API key (x-rag-internal-key header) - for server-to-server calls
 * 2. Authenticated user (JWT + wallet signature) - for browser-side agent calls
 *
 * Rate limiting handled by middleware.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import { authMiddleware } from "@/lib/auth/authMiddleware";

// ============================================================================
// Configuration
// ============================================================================

const INDEX_NAME = "pragma-docs";
const NAMESPACE = "docs";
const TOP_K = 5;
const MIN_SCORE = 0.3; // Lowered from 0.5 - semantic search scores are typically 0.3-0.5 for good matches

// Internal API key for server-to-server calls
// This prevents external access while allowing tools to call this endpoint
const INTERNAL_API_KEY = process.env.RAG_INTERNAL_KEY;

// ============================================================================
// Singleton Pinecone Client
// ============================================================================

let pineconeClient: Pinecone | null = null;

function getPineconeClient(): Pinecone {
  if (!pineconeClient) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error("PINECONE_API_KEY not configured");
    }
    pineconeClient = new Pinecone({ apiKey });
  }
  return pineconeClient;
}

// ============================================================================
// Route Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // =========================================================================
    // SECURITY: Verify internal API key OR authenticated user
    // =========================================================================

    const internalKeyHeader = request.headers.get("x-rag-internal-key");
    const hasInternalKey = INTERNAL_API_KEY && internalKeyHeader === INTERNAL_API_KEY;

    // If no valid internal key, try user authentication
    if (!hasInternalKey) {
      const authError = await authMiddleware(request);
      if (authError) {
        // Neither internal key nor valid user auth
        console.warn("[RAG] Unauthorized request - no valid internal key or user auth");
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
      // User is authenticated via JWT + wallet signature
    }

    // =========================================================================
    // Parse Request
    // =========================================================================

    const body = await request.json();
    const query = body.query as string;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid query parameter" },
        { status: 400 }
      );
    }

    // =========================================================================
    // Perform Semantic Search
    // =========================================================================

    const pc = getPineconeClient();
    const index = pc.index(INDEX_NAME);
    const namespace = index.namespace(NAMESPACE);

    const results = await namespace.searchRecords({
      query: {
        topK: TOP_K,
        inputs: { text: query },
      },
      fields: ["text", "protocol", "category", "source"],
    });

    // =========================================================================
    // Process Results
    // =========================================================================

    if (!results.result?.hits || results.result.hits.length === 0) {
      return NextResponse.json({
        result: "No relevant documentation found.",
        hits: 0,
      });
    }

    // Format results with deduplication
    const chunks: string[] = [];
    const seenTexts = new Set<string>();

    for (const hit of results.result.hits) {
      const fields = hit.fields as Record<string, unknown>;
      const text = fields?.text as string;
      const protocol = fields?.protocol as string;
      const score = hit._score ?? 0;

      // Skip low-relevance results
      if (score < MIN_SCORE) continue;

      // Skip duplicates (85% similarity approximation via prefix)
      const textKey = text?.substring(0, 100);
      if (seenTexts.has(textKey)) continue;
      seenTexts.add(textKey);

      // Format with protocol tag
      if (text) {
        const prefix = protocol ? `[${protocol.toUpperCase()}] ` : "";
        chunks.push(`${prefix}${text}`);
      }
    }

    if (chunks.length === 0) {
      return NextResponse.json({
        result: "No relevant documentation found.",
        hits: 0,
      });
    }

    // Combine and truncate to ~500 tokens
    const combined = chunks.join("\n\n");
    const truncated = combined.length > 2000
      ? combined.substring(0, 2000) + "..."
      : combined;

    return NextResponse.json({
      result: `**Protocol Documentation:**\n\n${truncated}`,
      hits: chunks.length,
    });

  } catch (error) {
    console.error("[RAG] Search error:", error);
    return NextResponse.json(
      { error: "Internal server error", result: "Using system prompt knowledge." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/rag - Health check
 */
export async function GET() {
  const hasApiKey = !!process.env.PINECONE_API_KEY;
  const hasInternalKey = !!process.env.RAG_INTERNAL_KEY;

  return NextResponse.json({
    status: hasApiKey && hasInternalKey ? "ready" : "not_configured",
    pinecone: hasApiKey ? "configured" : "missing PINECONE_API_KEY",
    auth: hasInternalKey ? "configured" : "missing RAG_INTERNAL_KEY",
  });
}
