/**
 * H2 Sign Response API Route
 *
 * Receives signatures from client and resumes tool execution.
 *
 * Flow:
 * 1. Client receives signature_request SSE event
 * 2. Client signs with Web3Auth owner wallet
 * 3. Client POSTs signature to this endpoint
 * 4. This endpoint emits event via signatureCoordinator
 * 5. Tool's awaiting promise resolves
 * 6. Tool continues execution with signature
 */

import { NextRequest } from 'next/server';
import type { Hex } from 'viem';
import { respondToSignature } from '@/lib/h2/signatureCoordinator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, signature } = body as { requestId: string; signature: Hex };

    // Validate request
    if (!requestId || !signature) {
      console.error('[Sign Response] Missing requestId or signature');
      return new Response(
        JSON.stringify({ error: 'requestId and signature required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Sign Response] Received signature for request ${requestId}`);

    // Emit signature to waiting tool via EventEmitter
    respondToSignature(requestId, signature);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Sign Response] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to process signature',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Reject other methods
export async function GET() {
  return new Response('Method not allowed', { status: 405 });
}
