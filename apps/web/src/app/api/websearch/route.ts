/**
 * Web Search API Route - xAI Grok Native Web Search
 *
 * Server-side endpoint for web searches using xAI's Grok web_search tool.
 * Called by webSearchTool during H2 agent execution.
 *
 * Why Grok? DeepSeek, Kimi, and other LLMs don't have native web search.
 * Grok's Responses API provides real-time web search with citations.
 *
 * Security: Accepts EITHER:
 * 1. Internal API key (x-rag-internal-key header) - for server-to-server calls
 * 2. Authenticated user (JWT + wallet signature) - for browser-side agent calls
 *
 * Uses the same auth pattern as /api/rag for consistency.
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { authMiddleware } from "@/lib/auth/authMiddleware";

// ============================================================================
// Configuration
// ============================================================================

// Internal API key for server-to-server calls (reuses RAG_INTERNAL_KEY)
const INTERNAL_API_KEY = process.env.RAG_INTERNAL_KEY;

// xAI API key for Grok web search
const XAI_API_KEY = process.env.XAI_API_KEY;

// ============================================================================
// Types
// ============================================================================

interface WebSearchRequest {
  query: string;
  userLocation?: {
    country?: string;
    city?: string;
    region?: string;
  };
}

interface Citation {
  url: string;
  title: string;
  startIndex: number;
  endIndex: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract citations from xAI Grok response
 * xAI uses the same OpenAI-compatible response format
 */
function extractCitations(response: OpenAI.Responses.Response): Citation[] {
  const citations: Citation[] = [];

  // Navigate through the response output to find annotations
  for (const item of response.output || []) {
    if (item.type === "message" && item.content) {
      for (const content of item.content) {
        if (content.type === "output_text" && content.annotations) {
          for (const annotation of content.annotations) {
            if (annotation.type === "url_citation") {
              citations.push({
                url: annotation.url,
                title: annotation.title || "",
                startIndex: annotation.start_index,
                endIndex: annotation.end_index,
              });
            }
          }
        }
      }
    }
  }

  return citations;
}

// ============================================================================
// Singleton xAI Client (OpenAI-compatible)
// ============================================================================

let xaiClient: OpenAI | null = null;

function getXAIClient(): OpenAI {
  if (!xaiClient) {
    if (!XAI_API_KEY) {
      throw new Error("XAI_API_KEY not configured");
    }
    // xAI API is OpenAI SDK compatible - just change base URL
    xaiClient = new OpenAI({
      apiKey: XAI_API_KEY,
      baseURL: "https://api.x.ai/v1",
    });
  }
  return xaiClient;
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
    const hasInternalKey =
      INTERNAL_API_KEY && internalKeyHeader === INTERNAL_API_KEY;

    // If no valid internal key, try user authentication
    if (!hasInternalKey) {
      const authError = await authMiddleware(request);
      if (authError) {
        console.warn(
          "[WebSearch] Unauthorized request - no valid internal key or user auth"
        );
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // =========================================================================
    // Parse Request
    // =========================================================================

    const body: WebSearchRequest = await request.json();
    const { query, userLocation } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid query parameter" },
        { status: 400 }
      );
    }

    // =========================================================================
    // Perform Web Search using xAI Grok Responses API
    // =========================================================================

    const client = getXAIClient();

    // Build web_search tool configuration
    // xAI supports the same tool format as OpenAI
    const tools: OpenAI.Responses.Tool[] = [
      {
        type: "web_search" as const,
        // Note: xAI doesn't support user_location like OpenAI does
        // but supports allowed_domains, excluded_domains, from_date, to_date
      },
    ];

    const response = await client.responses.create({
      model: "grok-4-1-fast-non-reasoning", // Grok 4 family required for server-side tools
      input: query,
      tools,
    });

    // =========================================================================
    // Process Response
    // =========================================================================

    const outputText = response.output_text || "No results found.";
    const citations = extractCitations(response);

    // Format response with citations
    let result = outputText;
    if (citations.length > 0) {
      const sourcesList = citations
        .slice(0, 5) // Limit to 5 sources
        .map((c) => `- [${c.title || "Source"}](${c.url})`)
        .join("\n");
      result = `${outputText}\n\n**Sources:**\n${sourcesList}`;
    }

    return NextResponse.json({
      result,
      citations,
      raw_output: outputText,
    });
  } catch (error) {
    console.error("[WebSearch] Error:", error);

    // Handle specific xAI/OpenAI errors
    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        {
          error: "Web search temporarily unavailable",
          result: "Unable to search the web at this time.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error", result: "Web search failed." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/websearch - Health check
 */
export async function GET() {
  const hasApiKey = !!XAI_API_KEY;
  const hasInternalKey = !!INTERNAL_API_KEY;

  return NextResponse.json({
    status: hasApiKey ? "ready" : "not_configured",
    xai: hasApiKey ? "configured" : "missing XAI_API_KEY",
    auth: hasInternalKey ? "configured" : "missing RAG_INTERNAL_KEY",
  });
}
