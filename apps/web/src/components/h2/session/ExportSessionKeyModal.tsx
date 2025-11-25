/**
 * ExportSessionKeyModal Component
 *
 * Modal for exporting session key private key with security warnings.
 * Requires user confirmation before revealing sensitive data.
 */

'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { X, AlertTriangle, Key, Copy, Check, Eye, EyeOff } from 'lucide-react'

interface ExportSessionKeyModalProps {
  isOpen: boolean
  onClose: () => void
  privateKey: string | null
}

export function ExportSessionKeyModal({ isOpen, onClose, privateKey }: ExportSessionKeyModalProps) {
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
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md bg-black/90 border border-white/10 rounded-[24px] p-0 overflow-hidden backdrop-blur-xl">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="p-6 space-y-4"
        >
          {/* Header */}
          <div className="flex justify-between items-start gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-white/90">
                  Export Private Key
                </DialogTitle>
                <p className="text-xs text-white/50 mt-0.5">
                  Your session key private key controls funds and access
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-white/5 rounded transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-white/40" />
            </button>
          </div>

          {/* Security Warnings */}
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <h3 className="font-medium text-red-400 mb-2 flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4" />
              Critical Security Warning
            </h3>
            <ul className="space-y-1.5 text-xs text-white/70">
              <li className="flex gap-2">
                <span className="flex-shrink-0 text-white/40">•</span>
                <span>Anyone with this key can control your session key funds</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 text-white/40">•</span>
                <span>Never share this key with anyone or enter it on untrusted sites</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 text-white/40">•</span>
                <span>Store it securely offline (e.g., password manager, hardware wallet)</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 text-white/40">•</span>
                <span>Pragma will never ask for your private key</span>
              </li>
            </ul>
          </div>

          {/* Confirmation Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-2 border-white/20 bg-white/5 checked:bg-red-500 checked:border-red-500 cursor-pointer accent-red-500"
            />
            <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors">
              I understand the risks and will keep this key secure
            </span>
          </label>

          {/* Private Key Display */}
          <AnimatePresence>
            {understood && privateKey && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-white/50 flex items-center gap-2">
                      <Key className="w-3 h-3" />
                      Private Key
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setRevealed(!revealed)}
                        className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        aria-label={revealed ? 'Hide key' : 'Reveal key'}
                      >
                        {revealed ? (
                          <EyeOff className="w-4 h-4 text-white/60" />
                        ) : (
                          <Eye className="w-4 h-4 text-white/60" />
                        )}
                      </button>
                      <button
                        onClick={handleCopy}
                        className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        aria-label="Copy key"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4 text-white/60" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="font-mono text-xs text-white/80 break-all leading-relaxed">
                    {revealed ? privateKey : '•'.repeat(66)}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Button */}
          <button
            onClick={handleClose}
            disabled={!understood}
            className="w-full py-2.5 px-4 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium text-sm"
          >
            Close
          </button>

          {/* Additional Security Notice */}
          <div className="pt-3 border-t border-white/10">
            <p className="text-[11px] text-white/30 text-center">
              Session keys are ephemeral. For long-term storage, use your main wallet.
            </p>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
