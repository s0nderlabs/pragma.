/**
 * H2 Feedback Analytics
 *
 * Client-side utility for submitting user feedback (thumbs up/down) on AI responses.
 * Sends feedback to /api/feedback which stores it in Supabase.
 */

export type FeedbackType = 'positive' | 'negative';

export interface FeedbackParams {
  /** Message ID for tracking */
  messageId: string;
  /** Feedback type (thumbs up = positive, thumbs down = negative) */
  type: FeedbackType;
  /** AI assistant's response content */
  content?: string;
  /** User's original question/message that prompted this response */
  userMessage?: string;
  /** User's wallet address */
  userAddress?: string;
}

/**
 * Submit feedback to analytics
 *
 * Stores both the user's question and AI's response for full context.
 * This helps understand what went wrong when feedback is negative.
 *
 * @param params - Feedback parameters
 * @returns Promise that resolves when feedback is submitted
 *
 * @example
 * ```ts
 * await submitFeedback({
 *   messageId: 'msg-123',
 *   type: 'negative',
 *   content: 'AI response here...',
 *   userMessage: 'User question here...',
 *   userAddress: '0x...',
 * });
 * ```
 */
export async function submitFeedback(params: FeedbackParams): Promise<void> {
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_id: params.messageId,
        feedback_type: params.type,
        message_content: params.content,
        user_message: params.userMessage,
        user_address: params.userAddress,
      }),
    });

    if (!response.ok) {
      // Log but don't throw - feedback is best-effort
      console.warn(`Feedback submission failed: ${response.status}`);
    }
  } catch (error) {
    // Silent fail - feedback shouldn't break UX
    console.warn('Failed to submit feedback:', error);
  }
}

/**
 * Delete feedback when user undoes their selection
 *
 * Called when user clicks the same thumbs up/down button again to undo.
 *
 * @param messageId - The message ID to delete feedback for
 * @returns Promise that resolves when feedback is deleted
 */
export async function deleteFeedback(messageId: string): Promise<void> {
  try {
    const response = await fetch('/api/feedback', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId }),
    });

    if (!response.ok) {
      console.warn(`Feedback deletion failed: ${response.status}`);
    }
  } catch (error) {
    // Silent fail - feedback shouldn't break UX
    console.warn('Failed to delete feedback:', error);
  }
}
