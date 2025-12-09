/**
 * DeepSeek Summarization API Route
 *
 * Uses deepseek-chat to summarize reasoning content for ThinkingBubble display.
 * Called asynchronously after reasoning segment finalization.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { authMiddleware } from '@/lib/auth/authMiddleware';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const SUMMARIZE_PROMPT = `Summarize this AI reasoning in ONE short phrase (under 60 chars).
Use past tense. Focus on WHAT was analyzed, not conclusions.

Examples:
- "Analyzed swap parameters and validated routes"
- "Checked token balances and calculated amounts"
- "Evaluated staking options and APR rates"

Reasoning:
{content}

Summary (one line, under 60 chars):`;

export async function POST(request: NextRequest) {
  // Verify authentication
  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    const { content } = await request.json();

    // Skip summarization for short content
    if (!content || content.length < 200) {
      return NextResponse.json({ summary: null });
    }

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'user',
          content: SUMMARIZE_PROMPT.replace('{content}', content),
        },
      ],
      max_tokens: 50,
      temperature: 0.3,
    });

    const summary = response.choices[0]?.message?.content?.trim();
    return NextResponse.json({ summary: summary || null });
  } catch (error) {
    console.error('[DeepSeek Summarize] Error:', error);
    return NextResponse.json(
      { error: 'Failed to summarize', summary: null },
      { status: 500 }
    );
  }
}
