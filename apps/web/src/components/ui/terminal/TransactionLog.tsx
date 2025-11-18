'use client'

import { useState } from 'react'
import { AsciiStatus, AsciiTable } from './AsciiComponents'
import { cn } from '../../../lib/utils'

interface Transaction {
  id: string
  type: 'swap' | 'stake' | 'transfer' | 'wrap' | 'unwrap'
  from?: string
  to?: string
  amount?: string
  status: 'success' | 'pending' | 'failed'
  timestamp: string
  hash?: string
  gas?: string
}

interface TransactionLogProps {
  transactions?: Transaction[]
  className?: string
}

/**
 * TransactionLog - Terminal-style transaction history display
 * Shows transaction history with ASCII formatting
 */
export function TransactionLog({ transactions = [], className }: TransactionLogProps) {
  const [selectedTx, setSelectedTx] = useState<string | null>(null)

  // Sample transactions if none provided
  const sampleTransactions: Transaction[] = [
    {
      id: '1',
      type: 'swap',
      from: 'ETH',
      to: 'USDC',
      amount: '0.5',
      status: 'success',
      timestamp: '12:34:56',
      hash: '0xab42...f3d2',
      gas: '0.0012'
    },
    {
      id: '2',
      type: 'stake',
      amount: '100 MON',
      status: 'pending',
      timestamp: '12:33:12',
      gas: '0.0008'
    },
    {
      id: '3',
      type: 'transfer',
      to: '0x9876...4321',
      amount: '50 USDC',
      status: 'success',
      timestamp: '11:20:45',
      hash: '0xcd34...e2f1',
      gas: '0.0006'
    }
  ]

  const txList = transactions.length > 0 ? transactions : sampleTransactions

  const getTypeIcon = (type: Transaction['type']) => {
    switch (type) {
      case 'swap': return '⇄'
      case 'stake': return '◈'
      case 'transfer': return '→'
      case 'wrap': return '◎'
      case 'unwrap': return '○'
      default: return '•'
    }
  }

  const getStatusDisplay = (status: Transaction['status']) => {
    switch (status) {
      case 'success': return <AsciiStatus status="success" />
      case 'pending': return <AsciiStatus status="pending" />
      case 'failed': return <AsciiStatus status="error" />
      default: return <AsciiStatus status="inactive" />
    }
  }

  return (
    <div className={cn("font-mono text-sm", className)}>
      {/* Terminal Header */}
      <div className="mb-3 text-xs text-muted">
        <div>┌─ TRANSACTION LOG ─────────┐</div>
        <div>│ {txList.length} transactions found    │</div>
        <div>└───────────────────────────┘</div>
      </div>

      {/* Transaction List */}
      <div className="space-y-2">
        {txList.map((tx) => (
          <div
            key={tx.id}
            className={cn(
              "border border-border p-2 cursor-pointer transition-all",
              "hover:border-accent hover:bg-accent/5",
              selectedTx === tx.id && "border-accent bg-accent/10"
            )}
            onClick={() => setSelectedTx(selectedTx === tx.id ? null : tx.id)}
          >
            {/* Transaction Summary */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-accent">{getTypeIcon(tx.type)}</span>
                <span className="text-xs text-muted">{tx.timestamp}</span>
                <span className="text-foreground uppercase">{tx.type}</span>
              </div>
              {getStatusDisplay(tx.status)}
            </div>

            {/* Transaction Details */}
            <div className="mt-1 text-xs text-muted">
              {tx.type === 'swap' && (
                <span>{tx.amount} {tx.from} → {tx.to}</span>
              )}
              {tx.type === 'stake' && (
                <span>STAKE {tx.amount}</span>
              )}
              {tx.type === 'transfer' && (
                <span>SEND {tx.amount} TO {tx.to}</span>
              )}
              {(tx.type === 'wrap' || tx.type === 'unwrap') && (
                <span>{tx.type.toUpperCase()} {tx.amount}</span>
              )}
            </div>

            {/* Expanded Details */}
            {selectedTx === tx.id && (
              <div className="mt-2 pt-2 border-t border-border/30 text-xs space-y-1">
                {tx.hash && (
                  <div className="flex justify-between">
                    <span className="text-muted">HASH:</span>
                    <span className="text-accent font-mono">{tx.hash}</span>
                  </div>
                )}
                {tx.gas && (
                  <div className="flex justify-between">
                    <span className="text-muted">GAS:</span>
                    <span className="text-foreground">{tx.gas} MON</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted">STATUS:</span>
                  <span className="text-foreground uppercase">{tx.status}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Terminal Footer */}
      <div className="mt-3 pt-3 border-t border-border text-xs text-muted">
        <div className="flex justify-between">
          <span>TOTAL GAS: 0.0026 MON</span>
          <span>[MORE]</span>
        </div>
      </div>
    </div>
  )
}