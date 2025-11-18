'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ArrowUpRight, ArrowDownLeft, RefreshCw, Layers } from 'lucide-react'

/**
 * ActivityTab - Transaction History
 *
 * Clean list of recent transactions
 * Monospace amounts, clear status indicators
 * No decoration, pure information
 */
export function ActivityTab() {

  // Sample transactions - will be replaced with real data
  const transactions = [
    {
      id: 1,
      type: 'swap',
      from: 'ETH',
      to: 'USDC',
      amount: '0.5',
      value: '$892.50',
      status: 'success',
      time: '2 min ago',
    },
    {
      id: 2,
      type: 'send',
      to: '0xabcd...1234',
      amount: '100 USDC',
      value: '$100.00',
      status: 'success',
      time: '15 min ago',
    },
    {
      id: 3,
      type: 'receive',
      from: '0x5678...90ab',
      amount: '0.25 ETH',
      value: '$446.25',
      status: 'success',
      time: '1 hour ago',
    },
    {
      id: 4,
      type: 'stake',
      amount: '50 MON',
      value: '$125.00',
      apr: '12.4%',
      status: 'pending',
      time: '2 hours ago',
    },
    {
      id: 5,
      type: 'swap',
      from: 'USDC',
      to: 'MON',
      amount: '250',
      value: '$250.00',
      status: 'success',
      time: '5 hours ago',
    },
  ]

  const getIcon = (type: string) => {
    switch (type) {
      case 'swap':
        return <RefreshCw className="w-4 h-4" />
      case 'send':
        return <ArrowUpRight className="w-4 h-4" />
      case 'receive':
        return <ArrowDownLeft className="w-4 h-4" />
      case 'stake':
        return <Layers className="w-4 h-4" />
      default:
        return null
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-500'
      case 'pending':
        return 'text-yellow-500'
      case 'failed':
        return 'text-red-500'
      default:
        return 'text-white/40'
    }
  }

  return (
    <div className="space-y-2">
      {transactions.map((tx, index) => (
        <motion.div
          key={tx.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className={cn(
            "p-4 rounded-[24px]",
            "transition-all duration-200",
            "cursor-pointer border",
            "bg-white/10",
            "hover:bg-white/15",
            "border-white/10"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            {/* Left: Icon and Type */}
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-[12px]",
                "flex items-center justify-center",
                "bg-white/10",
                "text-white/60"
              )}>
                {getIcon(tx.type)}
              </div>
              <div>
                <div className="text-sm font-medium capitalize text-white">
                  {tx.type === 'swap' && `${tx.from} → ${tx.to}`}
                  {tx.type === 'send' && `Send to ${tx.to}`}
                  {tx.type === 'receive' && `From ${tx.from}`}
                  {tx.type === 'stake' && `Stake ${tx.apr}`}
                </div>
                <div className="text-xs text-white/40">
                  {tx.time}
                </div>
              </div>
            </div>

            {/* Right: Amount and Status */}
            <div className="text-right">
              <div className="text-sm font-mono font-medium text-white">
                {tx.value}
              </div>
              <div className={cn(
                "text-xs font-medium",
                getStatusColor(tx.status)
              )}>
                {tx.status === 'pending' && (
                  <span className="flex items-center gap-1 justify-end">
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    {tx.status}
                  </span>
                )}
                {tx.status !== 'pending' && tx.status}
              </div>
            </div>
          </div>
        </motion.div>
      ))}

      {/* Load More Button */}
      <button
        className={cn(
          "w-full py-3 rounded-[24px]",
          "text-sm font-medium",
          "transition-all duration-200 border",
          "text-white/60",
          "hover:text-white",
          "border-white/10",
          "hover:bg-white/10"
        )}
      >
        View all transactions
      </button>
    </div>
  )
}