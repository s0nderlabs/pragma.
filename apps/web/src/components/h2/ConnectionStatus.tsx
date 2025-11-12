/**
 * ConnectionStatus Component
 *
 * Shows H2 agent connection status with visual indicator.
 * Displays connection state and provides reconnection option.
 */

'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useH2ChatStore } from '@/stores/useH2ChatStore'
import { Wifi, WifiOff, Loader2, AlertCircle } from 'lucide-react'

export function ConnectionStatus() {
  const connectionState = useH2ChatStore((state) => state.connectionState)
  const isStreaming = useH2ChatStore((state) => state.isStreaming)

  // Don't show if disconnected and not streaming (normal idle state)
  if (connectionState === 'disconnected' && !isStreaming) {
    return null
  }

  // Determine display based on state
  const getStatusDisplay = () => {
    switch (connectionState) {
      case 'connecting':
        return {
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          text: 'Connecting...',
          color: 'text-yellow-400',
          bg: 'bg-yellow-500/20',
          border: 'border-yellow-500/30',
        }
      case 'connected':
        return {
          icon: <Wifi className="w-3 h-3" />,
          text: 'Connected',
          color: 'text-green-400',
          bg: 'bg-green-500/20',
          border: 'border-green-500/30',
        }
      case 'reconnecting':
        return {
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          text: 'Reconnecting...',
          color: 'text-orange-400',
          bg: 'bg-orange-500/20',
          border: 'border-orange-500/30',
        }
      case 'error':
        return {
          icon: <AlertCircle className="w-3 h-3" />,
          text: 'Connection Error',
          color: 'text-red-400',
          bg: 'bg-red-500/20',
          border: 'border-red-500/30',
        }
      default:
        return {
          icon: <WifiOff className="w-3 h-3" />,
          text: 'Disconnected',
          color: 'text-gray-400',
          bg: 'bg-gray-500/20',
          border: 'border-gray-500/30',
        }
    }
  }

  const status = getStatusDisplay()

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="fixed top-4 left-1/2 transform -translate-x-1/2 z-40"
      >
        <div
          className={`
            px-3 py-1.5 rounded-full border backdrop-blur-md
            flex items-center gap-2 text-xs font-medium
            ${status.bg} ${status.border} ${status.color}
          `}
        >
          {status.icon}
          <span>{status.text}</span>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
