/**
 * Monad RPC Proxy
 *
 * Proxies RPC requests to Ankr/Monad while keeping API key server-side.
 * Optional: Can use public RPC directly in browser for better performance.
 *
 * Security: RPC URL with API key stored in server-only MONAD_RPC_URL env var
 */

import { authMiddleware } from "@/lib/auth/authMiddleware";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // ✅ SECURITY: Authenticate request
    const authError = await authMiddleware(request);
    if (authError) {
      return authError;
    }
    // Get RPC URL from server-only environment variable (may contain API key)
    const rpcUrl = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';

    // Parse JSON-RPC request
    const body = await request.json();

    // Forward request to RPC endpoint
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[RPC Proxy] Error:', response.status, error);
      return Response.json(
        { jsonrpc: '2.0', id: body.id || 1, error: { code: response.status, message: `RPC error: ${response.statusText}` } },
        { status: 200 } // JSON-RPC errors still return 200
      );
    }

    // Return JSON-RPC response
    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('[RPC Proxy] Error:', error);
    return Response.json(
      { jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'Internal error' } },
      { status: 200 }
    );
  }
}
