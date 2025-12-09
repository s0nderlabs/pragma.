/**
 * Streaming Summary Client Utility
 *
 * Streams summary tokens from the DeepSeek API for real-time UI updates.
 * Uses authenticated fetch with SSE parsing.
 */

import { authenticatedFetch } from '@/lib/api/authenticatedFetch';

/**
 * Stream a summary for reasoning content
 *
 * @param content - Raw reasoning content to summarize
 * @param onToken - Called for each token as it streams in
 * @param onComplete - Called when stream completes with full summary
 * @param onError - Called if an error occurs
 */
export async function streamSummarize(
  content: string,
  onToken: (token: string) => void,
  onComplete: (summary: string) => void,
  onError: (error: Error) => void
): Promise<void> {
  try {
    const response = await authenticatedFetch('/api/deepseek/summarize-stream', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader');
    }

    const decoder = new TextDecoder();
    let fullSummary = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Append to buffer and process complete lines
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // Keep incomplete line in buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            onComplete(fullSummary.trim());
            return;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              fullSummary += parsed.text;
              onToken(parsed.text);
            }
            if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (parseError) {
            // Skip invalid JSON chunks
            if (data !== '' && !data.startsWith('{')) {
              console.warn('[streamSummarize] Invalid JSON:', data);
            }
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            onComplete(fullSummary.trim());
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              fullSummary += parsed.text;
              onToken(parsed.text);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }

    onComplete(fullSummary.trim());
  } catch (error) {
    console.warn('[streamSummarize] Error:', error);
    onError(error as Error);
  }
}
