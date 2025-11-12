/**
 * ExportSessionKeyModal Component
 *
 * Modal for exporting session key private key with security warnings.
 * Requires user confirmation before revealing sensitive data.
 */

'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/stores/useThemeStore'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { X, AlertTriangle, Key, Copy, Check, Eye, EyeOff } from 'lucide-react'

interface ExportSessionKeyModalProps {
  isOpen: boolean
  onClose: () => void
  privateKey: string | null
}

export function ExportSessionKeyModal({ isOpen, onClose, privateKey }: ExportSessionKeyModalProps) {
  const { theme } = useThemeStore()
  const [understood, setUnderstood] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!privateKey) return

    try {
      await navigator.clipboard.writeText(privateKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy private key:', error)
    }
  }

  const handleClose = () => {
    setUnderstood(false)
    setRevealed(false)
    setCopied(false)
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <LiquidGlassPanel
              theme={theme}
              className="w-full max-w-md rounded-3xl p-6 relative"
              blurAmount={8}
              displacementScale={0.5}
              stdDeviation={0.04}
            >
              {/* Close Button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5 opacity-60" />
              </button>

              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-red-500/20">
                    <AlertTriangle className="w-6 h-6 text-red-400" />
                  </div>
                  <h2 className="text-xl font-semibold">Export Private Key</h2>
                </div>
                <p className="text-sm opacity-70">
                  Your session key private key controls funds and access
                </p>
              </div>

              {/* Security Warnings */}
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                <h3 className="font-semibold text-red-400 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Critical Security Warning
                </h3>
                <ul className="space-y-2 text-xs opacity-90">
                  <li className="flex gap-2">
                    <span className="flex-shrink-0">•</span>
                    <span>Anyone with this key can control your session key funds</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0">•</span>
                    <span>Never share this key with anyone or enter it on untrusted sites</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0">•</span>
                    <span>Store it securely offline (e.g., password manager, hardware wallet)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0">•</span>
                    <span>Pragma will never ask for your private key</span>
                  </li>
                </ul>
              </div>

              {/* Confirmation Checkbox */}
              <label className="flex items-start gap-3 mb-6 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-2 border-white/20 bg-white/5 checked:bg-purple-500 checked:border-purple-500 cursor-pointer"
                />
                <span className="text-sm opacity-90 group-hover:opacity-100 transition-opacity">
                  I understand the risks and will keep this key secure
                </span>
              </label>

              {/* Private Key Display */}
              {understood && privateKey && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mb-6"
                >
                  <div className="p-4 rounded-xl bg-black/30 border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium opacity-60 flex items-center gap-2">
                        <Key className="w-3 h-3" />
                        Private Key
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setRevealed(!revealed)}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                          aria-label={revealed ? 'Hide key' : 'Reveal key'}
                        >
                          {revealed ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={handleCopy}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                          aria-label="Copy key"
                        >
                          {copied ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="font-mono text-sm break-all">
                      {revealed ? privateKey : '•'.repeat(66)}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Action Button */}
              <button
                onClick={handleClose}
                disabled={!understood}
                className="w-full py-3 px-4 rounded-xl bg-purple-500 hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Close
              </button>

              {/* Additional Security Notice */}
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-xs opacity-40 text-center">
                  Session keys are ephemeral. For long-term storage, use your main wallet.
                </p>
              </div>
            </LiquidGlassPanel>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
