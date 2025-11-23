/**
 * Pimlico Bundler/Paymaster RPC Proxy
 *
 * Proxies requests to Pimlico API while keeping API key server-side.
 * Handles both bundler and paymaster RPC methods.
 *
 * Security: API key stored in server-only PIMLICO_API_KEY env var
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Get API key and chain from server-only environment variables
    const apiKey = process.env.PIMLICO_API_KEY;
    const chain = process.env.NEXT_PUBLIC_PIMLICO_CHAIN || 'monad-testnet';

    if (!apiKey) {
      return Response.json(
        { error: 'Pimlico API key not configured' },
        { status: 500 }
      );
    }

    // Parse JSON-RPC request
    const body = await request.json();

    // Build Pimlico URL with API key
    const url = `https://api.pimlico.io/v2/${chain}/rpc?apikey=${apiKey}`;

    // Forward request to Pimlico
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Pimlico Proxy] Error:', response.status, error);
      return Response.json(
        { error: `Pimlico API error: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Return JSON-RPC response
    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('[Pimlico Proxy] Error:', error);
    return Response.json(
      { error: 'Internal proxy error' },
      { status: 500 }
    );
  }
}
