/**
 * DeepSeek Chat Completions API Proxy with Reasoning State Management
 *
 * This proxy handles the special requirements of DeepSeek's reasoning model:
 * 1. Extract reasoning_content from responses
 * 2. Store reasoning_content in Upstash Redis (via @vercel/kv)
 * 3. Inject reasoning_content into assistant messages on subsequent requests
 *
 * ARCHITECTURE (Dec 2024):
 * Uses Upstash Redis (Vercel KV) for shared state across serverless instances.
 * This solves the "Missing reasoning_content" error in Vercel production where
 * in-memory Maps don't persist across different serverless instances.
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
 * Format: reasoning:{conversationId}:{messageIndex}
 */
function getReasoningKey(convId: string, msgIdx: number): string {
  return `reasoning:${convId}:${msgIdx}`;
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
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "DeepSeek API key not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();

    // Get conversation ID from header (or generate one)
    const convId =
      request.headers.get("x-conversation-id") ||
      `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // =========================================================================
    // Inject Reasoning for Current Turn Only (Per DeepSeek Docs)
    // =========================================================================
    // DeepSeek docs specify:
    // - KEEP reasoning_content within a tool-calling chain (same turn)
    // - DISCARD reasoning_content when user sends new message (new turn)
    //
    // We find the last user message and only inject reasoning for assistants
    // AFTER that index. This saves tokens and follows API best practices.

    // Find index of last user message (start of current turn)
    const lastUserIdx = body.messages.reduce(
      (lastIdx: number, msg: { role: string }, idx: number) =>
        msg.role === "user" ? idx : lastIdx,
      -1
    );

    // Only inject reasoning for assistant messages AFTER last user message
    const messagesWithReasoning = await Promise.all(
      body.messages.map(
        async (
          msg: { role: string; reasoning_content?: string },
          idx: number
        ) => {
          if (msg.role === "assistant" && idx > lastUserIdx) {
            const reasoning = await getReasoning(convId, idx);
            if (reasoning) {
              return { ...msg, reasoning_content: reasoning };
            }
          }
          return msg;
        }
      )
    );

    // Count assistants for logging
    const totalAssistants = body.messages.filter(
      (msg: { role: string }) => msg.role === "assistant"
    ).length;
    const currentTurnAssistants = body.messages.filter(
      (msg: { role: string }, idx: number) =>
        msg.role === "assistant" && idx > lastUserIdx
    ).length;

    // Log reasoning injection for debugging
    console.log("[DeepSeek Proxy] Reasoning injection:", {
      messageCount: body.messages.length,
      lastUserIdx,
      totalAssistants,
      currentTurnAssistants, // Only these get reasoning injected
    });

    // Log request details for debugging
    console.log("[DeepSeek Proxy] Request:", {
      model: body.model,
      messageCount: body.messages?.length,
      stream: body.stream,
      conversationId: convId,
    });

    // Forward to DeepSeek with modified messages
    const response = await fetch(
      "https://api.deepseek.com/v1/chat/completions",
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

    console.log("[DeepSeek Proxy] Response status:", response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error("[DeepSeek Proxy] Error:", response.status, error);
      return Response.json(
        { error: `DeepSeek API error: ${response.statusText}`, details: error },
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
    console.error("[DeepSeek Proxy] Error:", error);
    return Response.json({ error: "Internal proxy error" }, { status: 500 });
  }
}

// ============================================================================
// Streaming Handler with Reasoning Extraction
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

  let accumulatedReasoning = "";
  const newMessageIndex = currentMessageCount; // Index of the new assistant message

  let chunkCount = 0;

  // Token tracking: capture usage from final chunk
  let usageData: {
    prompt_tokens?: number;
    completion_tokens?: number;
    reasoning_tokens?: number;
    total_tokens?: number;
  } | null = null;

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
            // Store accumulated reasoning to Upstash before ending
            if (accumulatedReasoning && !reasoningStored) {
              await storeReasoning(convId, newMessageIndex, accumulatedReasoning);
              reasoningStored = true;
            }

            // Inject usage event before [DONE] for token tracking
            if (usageData) {
              const usageEvent = {
                type: "usage",
                usage: usageData,
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(usageEvent)}\n\n`)
              );
              console.log("[DeepSeek Proxy] Token usage:", usageData);
            }

            console.log(
              "[DeepSeek Proxy] Stream complete, total chunks:",
              chunkCount
            );
            controller.enqueue(encoder.encode(line + "\n\n"));
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            // Extract reasoning_content for storage
            if (delta?.reasoning_content) {
              accumulatedReasoning += delta.reasoning_content;
            }

            // Capture usage from final chunk (contains usage field)
            if (parsed.usage) {
              usageData = {
                prompt_tokens: parsed.usage.prompt_tokens,
                completion_tokens: parsed.usage.completion_tokens,
                reasoning_tokens: parsed.usage.completion_tokens_details?.reasoning_tokens,
                total_tokens: parsed.usage.total_tokens,
              };
            }

            // CRITICAL: LangChain drops unknown fields like reasoning_content
            // Solution: Inject reasoning into content with markers for client-side parsing
            // Format: <<REASON>>thinking text<<END_REASON>>
            if (delta) {
              let newContent = delta.content || "";

              // If there's reasoning_content, wrap it with markers and prepend to content
              if (delta.reasoning_content) {
                newContent = `<<REASON>>${delta.reasoning_content}<<END_REASON>>${newContent}`;
              }

              // Always set content (even if empty string)
              parsed.choices[0].delta.content = newContent;

              // Remove reasoning_content to avoid confusion (we've moved it to content)
              delete parsed.choices[0].delta.reasoning_content;
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
              `[DeepSeek Proxy] Stream chunk ${chunkCount}:`,
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
        if (accumulatedReasoning && !reasoningStored) {
          await storeReasoning(convId, newMessageIndex, accumulatedReasoning);
          reasoningStored = true;
        }

        controller.close();
      } catch (error) {
        console.error("[DeepSeek Proxy] Stream error:", error);
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
