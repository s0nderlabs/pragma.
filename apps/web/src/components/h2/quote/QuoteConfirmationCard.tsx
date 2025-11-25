'use client'

import { useState, useEffect } from 'react'
import { useThemeStore } from '@/stores/useThemeStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { ArrowRight, Loader2, AlertTriangle } from 'lucide-react'
import type { MonorailQuote } from '@pragma/core/monorail/pathfinder'

/**
 * QuoteConfirmationCard Component (H2)
 *
 * Displays swap quote details and allows user to confirm.
 *
 * Flow:
 * 1. AI generates quote using swapTool
 * 2. Quote displayed in this card (amounts, fees, price impact, gas)
 * 3. User clicks "Confirm" button
 * 4. onConfirm callback fires → creates ephemeral delegation → executes
 *
 * Props:
 * - quote: Monorail quote data
 * - fromToken: Source token symbol (e.g., "MON")
 * - toToken: Destination token symbol (e.g., "USDC")
 * - fromAmount: Amount to swap (e.g., "1.0")
 * - onConfirm: Callback when user confirms
 * - onCancel: Callback when user cancels
 */

interface QuoteConfirmationCardProps {
  quote: MonorailQuote
  fromToken: string
  toToken: string
  fromAmount: string
  protocolFee: string // Formatted protocol fee (e.g., "0.5 USDC")
  onConfirm: () => Promise<void>
  onCancel?: () => void
}

export function QuoteConfirmationCard({
  quote,
  fromToken,
  toToken,
  fromAmount,
  protocolFee,
  onConfirm,
  onCancel,
}: QuoteConfirmationCardProps) {
  const { theme: pragmaTheme } = useThemeStore()
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setIsConfirming(true)
    setError(null)

    try {
      await onConfirm()
      // On success, parent component will handle state updates
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed'
      setError(errorMessage)
      console.error('Quote confirmation failed:', err)
    } finally {
      setIsConfirming(false)
    }
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    }
  }

  // Format price impact
  const priceImpact = quote.compoundImpact
    ? parseFloat(quote.compoundImpact)
    : null
  const isPriceImpactHigh = priceImpact !== null && priceImpact > 1 // > 1%
  const isPriceImpactSevere = priceImpact !== null && priceImpact > 5 // > 5%

  return (
    <LiquidGlassPanel
      theme={pragmaTheme === 'pragma-dark' ? 'dark' : 'light'}
      className="w-full max-w-md p-6 space-y-4"
      blurAmount={6}
      displacementScale={0.5}
      stdDeviation={0.05}
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <h3 className="text-xl font-semibold">Confirm Swap</h3>
        <p className="text-sm opacity-60">Review your transaction details</p>
      </div>

      {/* Swap Summary */}
      <div className="space-y-3 py-4 border-y border-white/10">
        {/* From → To */}
        <div className="flex items-center justify-between text-lg font-medium">
          <span>{fromAmount} {fromToken}</span>
          <ArrowRight className="w-5 h-5 opacity-40" />
          <span>~{quote.outputFormatted} {toToken}</span>
        </div>

        {/* Route */}
        {quote.routes && quote.routes.length > 0 && (
          <div className="text-sm opacity-60">
            <span className="font-medium">Route: </span>
            {quote.routes.map(r => r.toSymbol || 'unknown').join(' → ')}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="space-y-2 text-sm">
        {/* Price Impact */}
        {priceImpact !== null && (
          <div className="flex justify-between items-center">
            <span className="opacity-60">Price Impact</span>
            <span className={`
              font-medium flex items-center gap-1
              ${isPriceImpactSevere ? 'text-red-500' : isPriceImpactHigh ? 'text-yellow-500' : ''}
            `}>
              {isPriceImpactSevere && <AlertTriangle className="w-4 h-4" />}
              {priceImpact.toFixed(2)}%
            </span>
          </div>
        )}

        {/* Protocol Fee */}
        <div className="flex justify-between">
          <span className="opacity-60">Protocol Fee (0.5%)</span>
          <span className="font-medium">{protocolFee} {toToken}</span>
        </div>

        {/* Gas Estimate */}
        {quote.gasEstimate && (
          <div className="flex justify-between">
            <span className="opacity-60">Est. Gas</span>
            <span className="font-medium">
              {(Number(quote.gasEstimate) / 1e18).toFixed(4)} MON
            </span>
          </div>
        )}

        {/* Quote ID */}
        <div className="flex justify-between text-xs opacity-40">
          <span>Quote ID</span>
          <span className="font-mono">{quote.quoteId.slice(0, 8)}...</span>
        </div>
      </div>

      {/* Warning for high price impact */}
      {isPriceImpactHigh && (
        <div className={`
          p-3 rounded-lg border flex items-start gap-2
          ${isPriceImpactSevere
            ? 'bg-red-500/10 border-red-500/20'
            : 'bg-yellow-500/10 border-yellow-500/20'
          }
        `}>
          <AlertTriangle className={`
            w-5 h-5 flex-shrink-0 mt-0.5
            ${isPriceImpactSevere ? 'text-red-500' : 'text-yellow-500'}
          `} />
          <div className="text-xs">
            <p className="font-medium mb-1">
              {isPriceImpactSevere ? 'Severe' : 'High'} Price Impact
            </p>
            <p className="opacity-70">
              This swap will significantly move the market price. Consider splitting into smaller trades.
            </p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        {/* Cancel Button */}
        {onCancel && (
          <button
            onClick={handleCancel}
            disabled={isConfirming}
            className={`
              flex-1 py-3 px-6 rounded-lg font-medium
              transition-all duration-200
              ${isConfirming
                ? 'opacity-30 cursor-not-allowed'
                : 'hover:opacity-80 active:scale-95'
              }
            `}
            style={{
              background: pragmaTheme === 'pragma-light'
                ? 'rgba(0, 0, 0, 0.05)'
                : 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            Cancel
          </button>
        )}

        {/* Confirm Button */}
        <button
          onClick={handleConfirm}
          disabled={isConfirming}
          className={`
            flex-1 py-3 px-6 rounded-lg font-medium
            transition-all duration-200
            ${isConfirming
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:scale-105 active:scale-95'
            }
          `}
          style={{
            background: pragmaTheme === 'pragma-light'
              ? 'linear-gradient(135deg, #E07A5F 0%, #7D3F2B 100%)'
              : 'linear-gradient(135deg, #F2A694 0%, #E07A5F 100%)',
            color: '#FFFFFF',
          }}
        >
          {isConfirming ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Confirming...
            </span>
          ) : (
            'Confirm Swap'
          )}
        </button>
      </div>

      {/* Info Text */}
      <div className="pt-2 border-t border-white/10">
        <p className="text-xs opacity-40 text-center">
          Confirming will create a one-time delegation and execute your swap.
        </p>
      </div>
    </LiquidGlassPanel>
  )
}
