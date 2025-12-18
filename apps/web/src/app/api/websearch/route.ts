/**
 * Web Search API Route - Multi-Provider Web Search
 *
 * Server-side endpoint for web searches. Supports multiple providers:
 * - Grok (xAI): Uses native web_search tool via Responses API
 * - Gemini (Google): Uses Google Search grounding via native Gemini API
 *
 * Provider Selection:
 * - Checks NEXT_PUBLIC_MODEL_PROVIDER env var
 * - If "gemini" → uses Gemini with Google Search grounding
 * - Otherwise → uses Grok (default, most reliable)
 *
 * Security: Accepts EITHER:
 * 1. Internal API key (x-rag-internal-key header) - for server-to-server calls
 * 2. Authenticated user (JWT + wallet signature) - for browser-side agent calls
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

// Gemini API key for Google Search grounding
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Model provider selection
const MODEL_PROVIDER = process.env.NEXT_PUBLIC_MODEL_PROVIDER || "deepseek";

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
// Gemini Search with Google Search Grounding
// ============================================================================

interface GeminiSearchResult {
  result: string;
  citations: Citation[];
  raw_output: string;
}

/**
 * Perform web search using Gemini's Google Search grounding
 * Uses native Gemini API (not OpenAI-compatible) for grounding support
 *
 * Model: gemini-3-flash-preview (Gemini 3 Flash)
 * Tool: googleSearch (camelCase for Gemini 3, was google_search for 2.0)
 */
async function searchWithGemini(query: string): Promise<GeminiSearchResult> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: query }] }],
        tools: [{ googleSearch: {} }],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("[WebSearch] Gemini error:", error);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();

  // Extract text from Gemini response
  const parts = data.candidates?.[0]?.content?.parts || [];
  let outputText = "";
  const citations: Citation[] = [];

  for (const part of parts) {
    if (part.text) {
      outputText += part.text;
    }
  }

  // Extract grounding metadata for citations
  const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
  if (groundingMetadata?.groundingChunks) {
    for (const chunk of groundingMetadata.groundingChunks) {
      if (chunk.web?.uri) {
        citations.push({
          url: chunk.web.uri,
          title: chunk.web.title || "",
          startIndex: 0,
          endIndex: 0,
        });
      }
    }
  }

  // Format response with citations
  let result = outputText || "No results found.";
  if (citations.length > 0) {
    const sourcesList = citations
      .slice(0, 5)
      .map((c) => `- [${c.title || "Source"}](${c.url})`)
      .join("\n");
    result = `${outputText}\n\n**Sources:**\n${sourcesList}`;
  }

  return { result, citations, raw_output: outputText };
}

/**
 * Perform web search using xAI Grok
 */
async function searchWithGrok(query: string): Promise<GeminiSearchResult> {
  const client = getXAIClient();

  const tools: OpenAI.Responses.Tool[] = [
    { type: "web_search" as const },
  ];

  const response = await client.responses.create({
    model: "grok-4-1-fast-non-reasoning",
    input: query,
    tools,
  });

  const outputText = response.output_text || "No results found.";
  const citations = extractCitations(response);

  let result = outputText;
  if (citations.length > 0) {
    const sourcesList = citations
      .slice(0, 5)
      .map((c) => `- [${c.title || "Source"}](${c.url})`)
      .join("\n");
    result = `${outputText}\n\n**Sources:**\n${sourcesList}`;
  }

  return { result, citations, raw_output: outputText };
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
    // Perform Web Search - Provider Selection
    // =========================================================================

    console.log(`[WebSearch] Using provider: ${MODEL_PROVIDER}`);

    let searchResult: GeminiSearchResult;

    if (MODEL_PROVIDER === "gemini") {
      // Use Gemini with Google Search grounding
      searchResult = await searchWithGemini(query);
    } else {
      // Default to Grok (most reliable)
      searchResult = await searchWithGrok(query);
    }

    return NextResponse.json(searchResult);
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
  const hasXaiKey = !!XAI_API_KEY;
  const hasGeminiKey = !!GEMINI_API_KEY;
  const hasInternalKey = !!INTERNAL_API_KEY;

  const activeProvider = MODEL_PROVIDER === "gemini" ? "gemini" : "grok";
  const isReady = activeProvider === "gemini" ? hasGeminiKey : hasXaiKey;

  return NextResponse.json({
    status: isReady ? "ready" : "not_configured",
    active_provider: activeProvider,
    providers: {
      grok: hasXaiKey ? "configured" : "missing XAI_API_KEY",
      gemini: hasGeminiKey ? "configured" : "missing GEMINI_API_KEY",
    },
    auth: hasInternalKey ? "configured" : "missing RAG_INTERNAL_KEY",
  });
}
