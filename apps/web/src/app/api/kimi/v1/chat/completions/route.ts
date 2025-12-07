/**
 * Kimi K2 Chat Completions API Proxy with Reasoning State Management
 *
 * This proxy handles the special requirements of Kimi K2's reasoning model:
 * 1. Extract reasoning_content from responses
 * 2. Store reasoning_content in Upstash Redis (via @vercel/kv)
 * 3. Inject reasoning_content into assistant messages on subsequent requests
 *
 * ARCHITECTURE (Dec 2024):
 * Uses Upstash Redis (Vercel KV) for shared state across serverless instances.
 * This solves the "Missing reasoning_content" error in Vercel production where
 * in-memory Maps don't persist across different serverless instances.
 *
 * PERFORMANCE OPTIMIZATIONS (vs DeepSeek proxy):
 * - Array accumulation for reasoning (O(n) vs O(n²) string concat)
 * - JSON fast-path for chunks without reasoning_content
 * - Non-blocking storeReasoning at stream end
 * - Empty assistant message filter (Kimi K2 is stricter than DeepSeek)
 */

import { authMiddleware } from "@/lib/auth/authMiddleware";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// Upstash KV Helpers
// ============================================================================

// TTL for reasoning storage (24 hours)
const REASONING_TTL_SECONDS = 24 * 60 * 60;

/**
 * Get the Redis key for a specific reasoning entry
 * Format: reasoning-kimi:{conversationId}:{messageIndex}
 * Note: Different prefix from DeepSeek to avoid key collisions
 */
function getReasoningKey(convId: string, msgIdx: number): string {
  return `reasoning-kimi:${convId}:${msgIdx}`;
}

/**
 * Store reasoning content in Upstash with TTL
 */
async function storeReasoning(
  convId: string,
  msgIdx: number,
  reasoning: string
): Promise<void> {
  if (reasoning?.trim()) {
    await kv.set(getReasoningKey(convId, msgIdx), reasoning, {
      ex: REASONING_TTL_SECONDS,
    });
  }
}

/**
 * Get reasoning content from Upstash
 */
async function getReasoning(
  convId: string,
  msgIdx: number
): Promise<string | null> {
  return kv.get<string>(getReasoningKey(convId, msgIdx));
}

// ============================================================================
// Request Handler
// ============================================================================

export async function POST(request: Request) {
  // Authenticate request
  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    const apiKey = process.env.MOONSHOT_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Moonshot API key not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();

    // Get conversation ID from header (or generate one)
    const convId =
      request.headers.get("x-conversation-id") ||
      `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Inject stored reasoning_content into assistant messages (from Upstash KV)
    // Also filter out empty assistant messages (Kimi K2 is stricter than DeepSeek)
    const messagesWithReasoning = (
      await Promise.all(
        body.messages.map(
          async (
            msg: {
              role: string;
              content?: string;
              reasoning_content?: string;
              tool_calls?: unknown[];
            },
            idx: number
          ) => {
            if (msg.role === "assistant") {
              // Skip empty assistant messages (no content AND no tool_calls)
              // Kimi K2 requires non-empty content for assistant messages
              if (!msg.content && !msg.tool_calls?.length) {
                return null; // Will be filtered out
              }

              const reasoning = await getReasoning(convId, idx);
              if (reasoning) {
                return {
                  ...msg,
                  reasoning_content: reasoning,
                };
              }
            }
            return msg;
          }
        )
      )
    ).filter(Boolean); // Remove null entries (empty assistant messages)

    // Log request details for debugging
    console.log("[Kimi K2 Proxy] Request:", {
      model: body.model,
      messageCount: body.messages?.length,
      filteredCount: messagesWithReasoning.length,
      stream: body.stream,
      conversationId: convId,
    });

    // Forward to Kimi K2 with modified messages
    const response = await fetch(
      "https://api.moonshot.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...body,
          messages: messagesWithReasoning,
        }),
      }
    );

    console.log("[Kimi K2 Proxy] Response status:", response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error("[Kimi K2 Proxy] Error:", response.status, error);
      return Response.json(
        { error: `Kimi K2 API error: ${response.statusText}`, details: error },
        { status: response.status }
      );
    }

    // Handle streaming response
    if (body.stream) {
      return streamWithReasoningExtraction(
        response,
        convId,
        body.messages.length
      );
    }

    // Handle non-streaming response
    const data = await response.json();

    // Extract and store reasoning_content in Upstash
    if (data.choices?.[0]?.message?.reasoning_content) {
      const msgIndex = body.messages.length; // New assistant message index
      await storeReasoning(
        convId,
        msgIndex,
        data.choices[0].message.reasoning_content
      );
    }

    return Response.json(data);
  } catch (error) {
    console.error("[Kimi K2 Proxy] Error:", error);
    return Response.json({ error: "Internal proxy error" }, { status: 500 });
  }
}

// ============================================================================
// Streaming Handler with Reasoning Extraction (Performance Optimized)
// ============================================================================

async function streamWithReasoningExtraction(
  response: Response,
  convId: string,
  currentMessageCount: number
): Promise<Response> {
  const reader = response.body?.getReader();
  if (!reader) {
    return Response.json({ error: "No response body" }, { status: 500 });
  }

  // PERF FIX 1: Use array accumulation instead of string concat (O(n) vs O(n²))
  const reasoningChunks: string[] = [];
  const newMessageIndex = currentMessageCount; // Index of the new assistant message

  let chunkCount = 0;

  // We need to store reasoning after stream completes, but ReadableStream.start
  // doesn't support returning a promise. So we'll store in the [DONE] handler
  // and also after the loop as a fallback.
  let reasoningStored = false;

  const stream = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let lineBuffer = ""; // Buffer for incomplete SSE lines

      // Helper to process a single complete SSE line
      const processLine = async (line: string) => {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            // PERF FIX 3: Fire-and-forget storeReasoning (non-blocking)
            if (reasoningChunks.length > 0 && !reasoningStored) {
              storeReasoning(convId, newMessageIndex, reasoningChunks.join(""))
                .catch((e) =>
                  console.error("[Kimi K2 Proxy] Failed to store reasoning:", e)
                );
              reasoningStored = true;
            }
            console.log(
              "[Kimi K2 Proxy] Stream complete, total chunks:",
              chunkCount
            );
            controller.enqueue(encoder.encode(line + "\n\n"));
            return;
          }

          // PERF FIX 2: Fast path - skip JSON parse when no reasoning_content
          if (!data.includes('"reasoning_content"')) {
            controller.enqueue(encoder.encode(line + "\n\n"));
            return;
          }

          // Slow path: Parse and transform chunks with reasoning_content
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            // Extract reasoning_content for storage (using array push)
            if (delta?.reasoning_content) {
              reasoningChunks.push(delta.reasoning_content);
            }

            // CRITICAL: LangChain drops unknown fields like reasoning_content
            // Solution: Inject reasoning into content with markers for client-side parsing
            // Format: <<REASON>>thinking text<<END_REASON>>
            if (delta) {
              const rc = delta.reasoning_content;
              const c = delta.content || "";

              // Combine reasoning and content
              parsed.choices[0].delta.content = rc
                ? `<<REASON>>${rc}<<END_REASON>>${c}`
                : c;

              // Remove reasoning_content to avoid confusion (we've moved it to content)
              if (rc) delete parsed.choices[0].delta.reasoning_content;
            }

            // Re-serialize and pass through (SSE requires \n\n after data lines)
            const modifiedLine = `data: ${JSON.stringify(parsed)}`;
            controller.enqueue(encoder.encode(modifiedLine + "\n\n"));
          } catch {
            // Not JSON, pass through as-is
            controller.enqueue(encoder.encode(line + "\n\n"));
          }
        } else if (line.trim()) {
          // Pass through non-data lines (keep-alive, etc.)
          controller.enqueue(encoder.encode(line + "\n"));
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Accumulate data in buffer (TCP can split at arbitrary byte boundaries)
          lineBuffer += decoder.decode(value, { stream: true });
          chunkCount++;

          // Log first few chunks for debugging
          if (chunkCount <= 3) {
            console.log(
              `[Kimi K2 Proxy] Stream chunk ${chunkCount}:`,
              lineBuffer.substring(0, 500)
            );
          }

          // Split into lines and keep incomplete last line in buffer
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() || ""; // Keep last (possibly incomplete) line

          // Process only complete lines
          for (const line of lines) {
            await processLine(line);
          }
        }

        // Process any remaining buffer after stream ends
        if (lineBuffer.trim()) {
          await processLine(lineBuffer);
        }

        // Ensure reasoning is stored even if [DONE] wasn't received
        if (reasoningChunks.length > 0 && !reasoningStored) {
          await storeReasoning(
            convId,
            newMessageIndex,
            reasoningChunks.join("")
          );
          reasoningStored = true;
        }

        controller.close();
      } catch (error) {
        console.error("[Kimi K2 Proxy] Stream error:", error);
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    status: response.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Conversation-Id": convId,
    },
  });
}
