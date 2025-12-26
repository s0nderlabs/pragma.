/**
 * H2 Feedback API Route
 *
 * Stores user feedback (thumbs up/down) on AI responses in Supabase.
 * Used for analytics and improving AI responses.
 *
 * POST: Submit new feedback
 * DELETE: Remove feedback (when user undoes their selection)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/admin/supabase';

interface FeedbackRequest {
  message_id: string;
  feedback_type: 'positive' | 'negative';
  /** The AI assistant's response message */
  message_content?: string;
  /** The user's original question/message that prompted this response */
  user_message?: string;
  user_address?: string;
}

interface DeleteFeedbackRequest {
  message_id: string;
}

/**
 * POST: Submit new feedback
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as FeedbackRequest;

    // Validate required fields
    if (!body.message_id || !body.feedback_type) {
      return NextResponse.json(
        { error: 'Missing required fields: message_id, feedback_type' },
        { status: 400 }
      );
    }

    // Validate feedback type
    if (!['positive', 'negative'].includes(body.feedback_type)) {
      return NextResponse.json(
        { error: 'Invalid feedback_type. Must be "positive" or "negative"' },
        { status: 400 }
      );
    }

    // Get Supabase admin client
    const supabase = getSupabaseAdmin();

    // Insert feedback into database
    // Stores both the user's question and the AI's response for full context
    const { error } = await supabase.from('users_feedback').insert({
      message_id: body.message_id,
      feedback_type: body.feedback_type,
      message_content: body.message_content || null,
      user_message: body.user_message || null,
      user_address: body.user_address || null,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Failed to insert feedback:', error);
      return NextResponse.json(
        { error: 'Failed to store feedback' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feedback API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: Remove feedback when user undoes their selection
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json() as DeleteFeedbackRequest;

    // Validate required fields
    if (!body.message_id) {
      return NextResponse.json(
        { error: 'Missing required field: message_id' },
        { status: 400 }
      );
    }

    // Get Supabase admin client
    const supabase = getSupabaseAdmin();

    // Delete feedback by message_id
    const { error } = await supabase
      .from('users_feedback')
      .delete()
      .eq('message_id', body.message_id);

    if (error) {
      console.error('Failed to delete feedback:', error);
      return NextResponse.json(
        { error: 'Failed to delete feedback' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feedback API delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
