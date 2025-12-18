/**
 * Gemini 3 Flash Chat Completions API Proxy with Thought Signature Handling
 *
 * This proxy handles Gemini 3 Flash via OpenAI-compatible endpoint with:
 * 1. Thought signature extraction from responses
 * 2. Thought signature injection into subsequent requests (required for tool calling)
 * 3. Thinking content extraction for UI display
 *
 * CRITICAL: Gemini 3 requires thought signatures for function calling.
 * Without them, tool calls fail with 400 error.
 *
 * Model: gemini-3-flash-preview
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
 */

import { authMiddleware } from "@/lib/auth/authMiddleware";
import { parseUserFriendlyError } from "@/lib/errors";
import { createLogger } from "@pragma/core";
import { kv } from "@vercel/kv";

const logger = createLogger("[Gemini Proxy]");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Gemini OpenAI-compatible endpoint
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

// TTL for storage (24 hours)
const STORAGE_TTL_SECONDS = 24 * 60 * 60;

// ============================================================================
// Redis Storage Helpers
// ============================================================================

/**
 * Store thought signature for a tool call
 * Key format: thought-sig:{convId}:{toolCallId}
 */
async function storeThoughtSignature(
  convId: string,
  toolCallId: string,
  signature: string
): Promise<void> {
  if (signature) {
    const key = `thought-sig:${convId}:${toolCallId}`;
    await kv.set(key, signature, { ex: STORAGE_TTL_SECONDS });
    logger.debug(`Stored thought signature for ${toolCallId}`);
  }
}

/**
 * Get thought signature for a tool call
 */
async function getThoughtSignature(
  convId: string,
  toolCallId: string
): Promise<string | null> {
  const key = `thought-sig:${convId}:${toolCallId}`;
  return kv.get<string>(key);
}

/**
 * Store the last assistant message's tool calls with signatures
 * This is used to inject signatures when tool results come back
 */
async function storeAssistantToolCalls(
  convId: string,
  toolCalls: Array<{ id: string; signature?: string }>
): Promise<void> {
  const key = `assistant-tools:${convId}`;
  await kv.set(key, JSON.stringify(toolCalls), { ex: STORAGE_TTL_SECONDS });
}

/**
 * Get stored assistant tool calls
 */
async function getAssistantToolCalls(
  convId: string
): Promise<Array<{ id: string; signature?: string }> | null> {
  const key = `assistant-tools:${convId}`;
  const data = await kv.get<string>(key);
  if (data) {
    try {
      return typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
      return null;
    }
  }
  return null;
}

// ============================================================================
// Request Handler
// ============================================================================

export async function POST(request: Request) {
  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const convId =
      request.headers.get("x-conversation-id") ||
      `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.debug("Request:", {
      model: body.model,
      messageCount: body.messages?.length,
      stream: body.stream,
      conversationId: convId,
    });

    // =========================================================================
    // Inject thought signatures into assistant messages with tool_calls
    // =========================================================================
    const messagesWithSignatures = await injectThoughtSignatures(
      body.messages,
      convId
    );

    // Build request body with thinking config via extra_body
    // According to docs, extra_body can be passed in raw HTTP requests too
    const geminiBody: Record<string, unknown> = {
      model: "gemini-3-flash-preview",
      messages: messagesWithSignatures,
      stream: body.stream ?? true,
      extra_body: {
        google: {
          thinking_config: {
            include_thoughts: true,
            thinking_level: "high", // Options: minimal, low, medium, high (default)
          },
        },
      },
    };

    // Pass through valid optional fields
    if (body.temperature !== undefined) geminiBody.temperature = body.temperature;
    if (body.max_tokens !== undefined) geminiBody.max_tokens = body.max_tokens;
    if (body.tools) geminiBody.tools = body.tools;
    if (body.tool_choice) geminiBody.tool_choice = body.tool_choice;

    logger.debug("Sending to Gemini with", messagesWithSignatures.length, "messages");

    // Forward to Gemini API
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(geminiBody),
    });

    logger.debug("Response status:", response.status);

    if (!response.ok) {
      const rawError = await response.text();
      logger.error("API error:", response.status, rawError);
      console.error("[Gemini Proxy] Full error:", rawError);
      return Response.json(
        {
          error: parseUserFriendlyError(`Gemini API error: ${response.statusText}`),
          details: rawError.slice(0, 500),
        },
        { status: response.status }
      );
    }

    // Handle streaming response
    if (body.stream) {
      return streamWithSignatureExtraction(response, convId);
    }

    // Handle non-streaming response
    const data = await response.json();
    await extractAndStoreSignatures(data, convId);
    return Response.json(data);
  } catch (error) {
    logger.error("Error:", error);
    return Response.json(
      { error: parseUserFriendlyError("Internal proxy error") },
      { status: 500 }
    );
  }
}

// ============================================================================
// Thought Signature Injection
// ============================================================================

interface Message {
  role: string;
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
    extra_content?: { google?: { thought_signature?: string } };
  }>;
  tool_call_id?: string;
}

/**
 * Inject thought signatures into assistant messages that have tool_calls
 */
async function injectThoughtSignatures(
  messages: Message[],
  convId: string
): Promise<Message[]> {
  const result: Message[] = [];
  const storedToolCalls = await getAssistantToolCalls(convId);

  for (const msg of messages) {
    if (msg.role === "assistant" && msg.tool_calls?.length) {
      // This assistant message has tool calls - inject signatures
      const toolCallsWithSigs = await Promise.all(
        msg.tool_calls.map(async (tc, idx) => {
          // Try to get stored signature
          const sig = await getThoughtSignature(convId, tc.id);

          if (sig) {
            logger.debug(`Injecting signature for tool ${tc.id}`);
            return {
              ...tc,
              extra_content: {
                google: {
                  thought_signature: sig,
                },
              },
            };
          }

          // For first tool call, signature is required
          if (idx === 0 && storedToolCalls) {
            const stored = storedToolCalls.find((s) => s.id === tc.id);
            if (stored?.signature) {
              logger.debug(`Injecting stored signature for tool ${tc.id}`);
              return {
                ...tc,
                extra_content: {
                  google: {
                    thought_signature: stored.signature,
                  },
                },
              };
            }
          }

          return tc;
        })
      );

      result.push({ ...msg, tool_calls: toolCallsWithSigs });
    } else {
      result.push(msg);
    }
  }

  return result;
}

// ============================================================================
// Thought Signature Extraction
// ============================================================================

/**
 * Extract and store signatures from non-streaming response
 */
async function extractAndStoreSignatures(
  data: { choices?: Array<{ message?: Message }> },
  convId: string
): Promise<void> {
  const choice = data.choices?.[0];
  if (!choice?.message?.tool_calls) return;

  const toolCallsToStore: Array<{ id: string; signature?: string }> = [];

  for (const tc of choice.message.tool_calls) {
    const sig = tc.extra_content?.google?.thought_signature;
    if (sig) {
      await storeThoughtSignature(convId, tc.id, sig);
      toolCallsToStore.push({ id: tc.id, signature: sig });
    } else {
      toolCallsToStore.push({ id: tc.id });
    }
  }

  if (toolCallsToStore.length > 0) {
    await storeAssistantToolCalls(convId, toolCallsToStore);
  }
}

// ============================================================================
// Streaming Handler with Signature Extraction
// ============================================================================

async function streamWithSignatureExtraction(
  response: Response,
  convId: string
): Promise<Response> {
  const reader = response.body?.getReader();
  if (!reader) {
    return Response.json({ error: "No response body" }, { status: 500 });
  }

  // Accumulate tool calls with signatures
  const pendingToolCalls: Map<number, { id: string; signature?: string }> = new Map();
  let chunkCount = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let lineBuffer = "";

      const processLine = async (line: string) => {
        if (!line.startsWith("data: ")) {
          if (line.trim()) {
            controller.enqueue(encoder.encode(line + "\n"));
          }
          return;
        }

        const data = line.slice(6);
        if (data === "[DONE]") {
          // Store accumulated tool calls before completing
          if (pendingToolCalls.size > 0) {
            const toolCalls = Array.from(pendingToolCalls.values());
            await storeAssistantToolCalls(convId, toolCalls);

            for (const tc of toolCalls) {
              if (tc.signature) {
                await storeThoughtSignature(convId, tc.id, tc.signature);
              }
            }
          }

          logger.debug("Stream complete, stored", pendingToolCalls.size, "tool calls");
          controller.enqueue(encoder.encode(line + "\n\n"));
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;

          // Extract tool calls with signatures
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const existing = pendingToolCalls.get(idx) || { id: "" };

              if (tc.id) {
                existing.id = tc.id;
              }

              const sig = tc.extra_content?.google?.thought_signature;
              if (sig) {
                existing.signature = sig;
                logger.debug(`Extracted signature for tool index ${idx}`);
              }

              pendingToolCalls.set(idx, existing);
            }
          }

          // Handle thinking content - convert to <<REASON>>...<<END_REASON>> format
          // Gemini 3 returns thought flag in extra_content.google.thought
          // AND wraps content in <thought>...</thought> XML tags
          //
          // Strategy: Use ONLY the isThoughtFlag from Gemini as the signal
          // Don't track state across chunks - tags can be split and cause over-capture
          if (delta) {
            const isThought = delta.extra_content?.google?.thought === true;
            let content = delta.content || "";

            // Debug: Log first few chunks
            if (chunkCount <= 10 && (content || delta.tool_calls)) {
              logger.debug(`Delta chunk ${chunkCount}:`, {
                isThought,
                contentPreview: content?.substring(0, 80),
              });
            }

            // Strip <thought> and </thought> XML tags from content
            // Also strip partial tags that might appear at chunk boundaries
            content = content
              .replace(/<thought>/g, '')
              .replace(/<\/thought>/g, '')
              .replace(/<\/?thought/g, '')  // Partial opening/closing
              .replace(/^>/, '');           // Leftover > from split tag

            // Always remove extra_content (LangChain doesn't understand it)
            delete parsed.choices[0].delta.extra_content;

            // Only wrap if Gemini explicitly flags this as thinking
            if (isThought && content) {
              content = `<<REASON>>${content}<<END_REASON>>`;
              logger.debug("Wrapped thinking chunk");
            }

            // Always update the content
            parsed.choices[0].delta.content = content;
          }

          // Pass through the (possibly modified) chunk
          const modifiedLine = `data: ${JSON.stringify(parsed)}`;
          controller.enqueue(encoder.encode(modifiedLine + "\n\n"));
        } catch {
          // Not JSON, pass through
          controller.enqueue(encoder.encode(line + "\n\n"));
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, { stream: true });
          chunkCount++;

          if (chunkCount <= 5) {
            // Log first chunks to see response format
            logger.debug(`Chunk ${chunkCount}:`, lineBuffer.substring(0, 500));
          }

          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() || "";

          for (const line of lines) {
            await processLine(line);
          }
        }

        if (lineBuffer.trim()) {
          await processLine(lineBuffer);
        }

        controller.close();
      } catch (error) {
        logger.error("Stream error:", error);
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
