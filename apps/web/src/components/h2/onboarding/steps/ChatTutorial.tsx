/**
 * ChatTutorial - Step 3 of Quickstart
 *
 * Tutorial showing how to chat with the AI agent using natural language.
 * UI matches actual ChatInput and UserMessage components.
 * Elegant stagger animations with serif typography.
 */

'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Zap, ArrowUpRight } from 'lucide-react'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.15 }
  }
}

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } }
}

export function ChatTutorial() {
  const examples = [
    { command: 'swap 10 MON to USDC', description: 'Exchange tokens' },
    { command: 'stake my MON', description: 'Earn staking rewards' },
    { command: 'send 5 USDC to alice.eth', description: 'Transfer tokens' },
    { command: 'what\'s my balance?', description: 'Check holdings' },
  ]

  return (
    <div className="flex-1 flex flex-col px-10 pb-4">
      {/* Header with serif typography */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8"
      >
        <h2 className="text-2xl md:text-3xl font-serif font-light tracking-tight text-white/90 mb-3">
          Chat with Pragma
        </h2>
        <p className="text-sm text-white/50">
          Just type what you want to do in plain English. No complex interfaces needed.
        </p>
      </motion.div>

      {/* Visual Demo */}
      <div className="flex-1 flex flex-col justify-center">
        {/* Mock Chat Interface */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-[28px] border border-white/10 bg-white/[0.02] overflow-hidden"
        >
          {/* Example Conversation */}
          <div className="p-6 space-y-5">
            {/* User Message */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex justify-end"
            >
              <div className="max-w-[70%] rounded-[20px] px-5 py-3 bg-zinc-800/80 border border-zinc-700/50">
                <p className="text-sm text-white/90">swap 10 MON to USDC</p>
              </div>
            </motion.div>

            {/* AI Response */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="text-sm text-white/80"
            >
              <p className="mb-2">I&apos;ll swap 10 MON for USDC. Here&apos;s the quote:</p>
              <div className="flex items-center gap-2 text-white/60">
                <span>10 MON</span>
                <ArrowRight className="w-4 h-4" />
                <span className="text-[#E07A5F] font-medium">~24.50 USDC</span>
              </div>
            </motion.div>
          </div>

          {/* Input Area */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="p-3"
          >
            <div className="rounded-[24px] p-3 flex items-center gap-2 bg-zinc-800/60 border border-zinc-700/40">
              <button className="flex-shrink-0 p-2 rounded-full text-white/30">
                <Zap className="w-4 h-4" />
              </button>
              <span className="flex-1 text-sm text-white/30">What&apos;s the play?</span>
              <button className="flex-shrink-0 flex items-center gap-1 px-4 py-2 rounded-full bg-white text-black">
                <span className="text-sm font-medium">Send</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </motion.div>

        {/* Example Commands with stagger */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="mt-6"
        >
          <motion.p variants={item} className="text-xs text-white/40 mb-3">Try commands like:</motion.p>
          <div className="grid grid-cols-2 gap-2">
            {examples.map((ex, i) => (
              <motion.div
                key={i}
                variants={item}
                className="px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors"
              >
                <code className="text-xs text-[#E07A5F]">{ex.command}</code>
                <p className="text-[10px] text-white/40 mt-1">{ex.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
