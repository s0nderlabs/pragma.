/**
 * OpenAI Responses API Proxy (Catch-All)
 *
 * Proxies requests to OpenAI API while keeping API key server-side.
 * Supports streaming responses for H2.5 agent real-time updates.
 *
 * This catch-all route handles any path under /api/h2/* and forwards to OpenAI.
 * Primary use: /api/h2/v1/responses (OpenAI Responses API with useResponsesApi: true)
 *
 * Security: API key stored in server-only OPENAI_API_KEY env var
 */

import { authMiddleware } from "@/lib/auth/authMiddleware";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // ✅ SECURITY: Authenticate request before allowing OpenAI API usage
  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    // Get API key from server-only environment variable
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await request.json();

    // Forward request to OpenAI Responses API
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[OpenAI Proxy] Error:', response.status, error);
      return Response.json(
        { error: `OpenAI API error: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Stream response back to client
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[OpenAI Proxy] Error:', error);
    return Response.json(
      { error: 'Internal proxy error' },
      { status: 500 }
    );
  }
}
