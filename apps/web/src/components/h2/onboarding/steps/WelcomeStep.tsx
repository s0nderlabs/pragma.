/**
 * WelcomeStep - Step 1 of Quickstart
 *
 * Clean welcome screen with Pragma logo and official tagline.
 * Uses pragma1-dark.svg directly since modal background is always dark.
 * Minimalist design with subtle ambient glow effect.
 */

'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'

export function WelcomeStep() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-10 pb-4 text-center">
      {/* Logo with ambient glow effect */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative mb-4"
      >
        {/* Subtle ambient glow behind logo */}
        <div className="absolute inset-0 blur-3xl bg-gradient-to-b from-[#E07A5F]/10 to-transparent scale-150 -z-10" />
        <Image
          src="/pragma1-dark.svg"
          alt="Pragma"
          width={360}
          height={140}
          priority
        />
      </motion.div>

      {/* Tagline with elegant serif typography */}
      <motion.h2
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="text-2xl md:text-3xl font-serif font-light tracking-tight text-white/60"
      >
        Natural Language Interface for Crypto
      </motion.h2>
    </div>
  )
}
