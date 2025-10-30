'use client'

import { ArrowUpRight, ArrowDownLeft, Repeat, Coins, Image, CheckCircle, Clock } from 'lucide-react'

/**
 * Receipt Archive accordion section
 * Shows list of past transactions with icons, amounts, timestamps
 * Placeholder for Phase 1 - will integrate with localStorage in Phase 2+
 */

interface ReceiptItem {
  id: string
  type: 'swap' | 'stake' | 'transfer-out' | 'transfer-in' | 'nft' | 'wrap'
  title: string
  amount: string
  timestamp: string
  status: 'completed' | 'pending'
}

const mockReceipts: ReceiptItem[] = [
  {
    id: '1',
    type: 'swap',
    title: 'Swap ETH → USDC',
    amount: '0.5 ETH',
    timestamp: '2 hours ago',
    status: 'completed',
  },
  {
    id: '2',
    type: 'stake',
    title: 'Stake MON',
    amount: '1,000 MON',
    timestamp: '5 hours ago',
    status: 'completed',
  },
  {
    id: '3',
    type: 'nft',
    title: 'Buy Genesis Ape #1337',
    amount: '2.5 ETH',
    timestamp: 'Yesterday',
    status: 'completed',
  },
  {
    id: '4',
    type: 'transfer-out',
    title: 'Send to 0x42a8...9f3d',
    amount: '500 USDC',
    timestamp: '2 days ago',
    status: 'completed',
  },
  {
    id: '5',
    type: 'wrap',
    title: 'Wrap MON → WMON',
    amount: '2,500 MON',
    timestamp: '3 days ago',
    status: 'completed',
  },
  {
    id: '6',
    type: 'transfer-in',
    title: 'Receive from 0x7f2b...1a4c',
    amount: '100 USDC',
    timestamp: '4 days ago',
    status: 'completed',
  },
]

function getReceiptIcon(type: ReceiptItem['type']) {
  switch (type) {
    case 'swap':
      return Repeat
    case 'stake':
      return Coins
    case 'transfer-out':
      return ArrowUpRight
    case 'transfer-in':
      return ArrowDownLeft
    case 'nft':
      return Image
    case 'wrap':
      return Repeat
  }
}

export function ReceiptArchive() {
  return (
    <div className="space-y-2">
      {mockReceipts.map((receipt) => {
        const Icon = getReceiptIcon(receipt.type)
        return (
          <button
            key={receipt.id}
            className="w-full text-left p-3 rounded-lg hover:bg-white/5 transition-colors group"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-white/10 transition-colors">
                <Icon className="w-4 h-4 opacity-60" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="font-medium text-sm truncate">{receipt.title}</div>
                  {receipt.status === 'completed' ? (
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  )}
                </div>
                <div className="text-xs opacity-60 mb-2">{receipt.amount}</div>
                <div className="text-xs opacity-40">{receipt.timestamp}</div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
