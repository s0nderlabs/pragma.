/**
 * Grok 4.1 Fast Chat Completions API Proxy
 *
 * Simple passthrough proxy to xAI's Grok API.
 * Unlike DeepSeek/Kimi, Grok's reasoning is encrypted so we don't need to:
 * - Extract reasoning_content
 * - Store state in Redis
 * - Inject reasoning on subsequent requests
 *
 * This makes the proxy much simpler - just forward requests and stream responses.
 */

import { authMiddleware } from "@/lib/auth/authMiddleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XAI_API_URL = "https://api.x.ai/v1/chat/completions";

export async function POST(request: Request) {
  // Authenticate request
  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "XAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();

    // Log request details for debugging
    console.log("[Grok Proxy] Request:", {
      model: body.model,
      messageCount: body.messages?.length,
      stream: body.stream,
    });

    // Forward to xAI Grok API
    const response = await fetch(XAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    console.log("[Grok Proxy] Response status:", response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error("[Grok Proxy] Error:", response.status, error);
      return Response.json(
        { error: `Grok API error: ${response.statusText}`, details: error },
        { status: response.status }
      );
    }

    // Handle streaming response - simple passthrough
    if (body.stream) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Handle non-streaming response
    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error("[Grok Proxy] Error:", error);
    return Response.json({ error: "Internal proxy error" }, { status: 500 });
  }
}
