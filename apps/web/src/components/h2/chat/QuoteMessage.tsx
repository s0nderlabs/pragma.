'use client'

import type { Message } from '@/stores/useChatStore'
import { QuoteConfirmationCard } from '../quote/QuoteConfirmationCard'

/**
 * QuoteMessage Component
 *
 * Renders a quote confirmation card in the chat.
 * Used when AI generates a swap quote and needs user confirmation.
 */

interface QuoteMessageProps {
  message: Message
}

export function QuoteMessage({ message }: QuoteMessageProps) {
  const { quoteData } = message

  if (!quoteData) {
    return (
      <div className="flex items-center justify-center my-4">
        <p className="text-sm opacity-40">Quote data missing</p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center my-6">
      <QuoteConfirmationCard
        quote={quoteData.quote}
        fromToken={quoteData.fromToken}
        toToken={quoteData.toToken}
        fromAmount={quoteData.fromAmount}
        protocolFee={quoteData.protocolFee}
        onConfirm={quoteData.onConfirm || (async () => {})}
        onCancel={quoteData.onCancel}
      />
    </div>
  )
}
