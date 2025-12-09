/**
 * DeepSeek Streaming Summarization API Route
 *
 * Streams summary tokens for real-time UI updates in ThinkingBubble.
 * Uses SSE (Server-Sent Events) for streaming response.
 */

import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { authMiddleware } from '@/lib/auth/authMiddleware';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const SUMMARIZE_PROMPT = `Summarize this AI agent's reasoning as if the agent is thinking out loud. Write from the agent's perspective (first person).

Style:
- First person ("I found...", "I need to...", "Looks like...")
- Natural self-talk, like internal monologue
- Capture the key realization or decision
- Keep it short (under 80 chars)

Examples:
- "I found the best route through Monorail - 2% better"
- "Looks like they have 3 tokens worth about $45"
- "I need to fund the session key first"
- "Bean has better slippage here, going with that"
- "Got it - routing through WMON saves on fees"

Reasoning:
{content}

Agent's thought:`;

export async function POST(request: NextRequest) {
  // Verify authentication
  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    const { content } = await request.json();

    if (!content) {
      return new Response('data: [DONE]\n\n', {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    const stream = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'user',
          content: SUMMARIZE_PROMPT.replace('{content}', content),
        },
      ],
      max_tokens: 100,
      temperature: 0.3,
      stream: true,
    });

    // Create streaming response
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('[DeepSeek Stream] Error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[DeepSeek Summarize Stream] Error:', error);
    return new Response(
      `data: ${JSON.stringify({ error: 'Failed to summarize' })}\n\ndata: [DONE]\n\n`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      }
    );
  }
}
