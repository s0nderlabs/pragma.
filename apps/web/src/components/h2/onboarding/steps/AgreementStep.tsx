/**
 * AgreementStep - Step 5 of Quickstart
 *
 * Clean typography-focused Terms of Use with 8 sections.
 * User must scroll to the bottom before checkbox becomes enabled.
 * Elegant stagger animations with serif typography.
 */

"use client";

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useQuickstartStore } from "../useQuickstartStore";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function AgreementStep() {
  const { hasAgreed, setAgreed } = useQuickstartStore();
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // Consider scrolled to bottom if within 20px of the end
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      setHasScrolledToBottom(true);
    }
  }, []);

  const canCheck = hasScrolledToBottom;

  return (
    <div className="flex-1 flex flex-col px-8 pb-3 overflow-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-4"
      >
        <h2 className="text-xl md:text-2xl font-serif font-light tracking-tight text-white/90">
          Terms of Use
        </h2>
      </motion.div>

      {/* Scrollable terms */}
      <motion.div
        ref={scrollRef}
        onScroll={handleScroll}
        variants={container}
        initial="hidden"
        animate="show"
        className="flex-1 overflow-y-auto pr-3 -mr-3 space-y-3 text-[13px] text-white/55 leading-relaxed"
      >
        {/* Section 1: Beta Status */}
        <motion.section variants={item}>
          <h3 className="text-white/85 font-medium text-sm mb-1">
            1. Beta Status
          </h3>
          <p>
            Pragma is currently in beta. Features may change and bugs may occur.
            You use this app at your own risk.
          </p>
        </motion.section>

        {/* Section 2: Your Smart Account */}
        <motion.section variants={item}>
          <h3 className="text-white/85 font-medium text-sm mb-1">
            2. Your Smart Account
          </h3>
          <p className="mb-1.5">
            When you connect with Web3Auth, Pragma creates a{" "}
            <span className="text-white/60">smart account</span> for you on
            Monad.
          </p>
          <div className="pl-2.5 border-l border-white/10 text-xs text-white/45 space-y-0.5">
            <p>• Your smart account is owned by your Web3Auth key</p>
            <p>• Pragma never has access to your private key</p>
          </div>
        </motion.section>

        {/* Section 3: Session Keys */}
        <motion.section variants={item}>
          <h3 className="text-white/85 font-medium text-sm mb-1">
            3. Session Keys
          </h3>
          <p className="mb-1.5">
            A session key is a{" "}
            <span className="text-white/60">temporary key</span> that Pragma
            uses to submit transactions on your behalf. It&apos;s generated on
            your device and never leaves your browser.
          </p>
          <div className="pl-2.5 border-l border-white/10 text-xs text-white/45 space-y-0.5">
            <p>
              • <span className="text-white/60">Purpose:</span> Signs and
              submits transactions after you approve
            </p>
            <p>
              • <span className="text-white/60">Funding:</span> Initial UserOp
              transfers MON from your smart account
            </p>
            <p>
              • <span className="text-white/60">Refills:</span> Delegation-based
              transfers (0.5 MON standard, 3.0 MON max)
            </p>
            <p>• You can export your session key from Settings at any time</p>
          </div>
        </motion.section>

        {/* Section 4: How Delegation Works */}
        <motion.section variants={item}>
          <h3 className="text-white/85 font-medium text-sm mb-1">
            4. How Delegation Works
          </h3>
          <p className="mb-1.5">
            Pragma uses MetaMask&apos;s Delegation Toolkit to act on your behalf
            — we never control your wallet.
          </p>
          <p className="text-xs text-white/60 mb-1">
            Ephemeral Delegations (per-transaction):
          </p>
          <div className="pl-2.5 border-l border-white/10 text-xs text-white/45 space-y-0.5 mb-1.5">
            <p>
              1. You request a transaction (e.g., &quot;swap 10 MON to
              USDC&quot;)
            </p>
            <p>2. Pragma generates a quote and shows it to you</p>
            <p>
              3. <span className="text-white/60">Normal Mode:</span> After
              confirm, Web3Auth signs delegation (no popup)
            </p>
            <p>
              4. <span className="text-white/60">Quick Mode:</span> Delegation
              signed automatically
            </p>
            <p>5. Session key submits transaction with delegation proof</p>
            <p>6. On-chain enforcers verify and execute if valid</p>
          </div>
          <p className="text-xs text-white/60 mb-1">Scope Restrictions (what each delegation can do):</p>
          <div className="pl-2.5 border-l border-white/10 text-xs text-white/45 space-y-0.5 mb-1.5">
            <p>
              • <span className="text-white/60">Swaps:</span> Only whitelisted DEX (Monorail) + approved token contracts
            </p>
            <p>
              • <span className="text-white/60">Transfers:</span> Only transfer() on the specific token with validated recipient
            </p>
            <p>
              • <span className="text-white/60">Staking:</span> Only deposit() on aPriori staking contract
            </p>
            <p>
              • <span className="text-white/60">Unstaking:</span> Only requestRedeem()/redeem() on aPriori
            </p>
            <p>
              • <span className="text-white/60">Wrap/Unwrap:</span> Only deposit()/withdraw() on WMON contract
            </p>
          </div>
          <p className="text-xs text-white/45 mb-1.5">
            Pragma <span className="text-white/60">cannot</span> call arbitrary contracts or functions — only the exact action you confirmed with validated parameters.
          </p>
          <p className="text-xs text-white/60 mb-1">
            Why &quot;Ephemeral&quot;?
          </p>
          <div className="pl-2.5 border-l border-white/10 text-xs text-white/45 space-y-0.5 mb-1.5">
            <p>• Created just-in-time (AFTER you confirm)</p>
            <p>• Valid for 5 minutes only</p>
            <p>• Limited to 1-3 calls per delegation</p>
          </div>
          <p className="text-xs text-white/45">
            <span className="text-white/60">Enforcers:</span> AllowedMethods,
            AllowedCalldata, LimitedCalls, Timestamp, Nonce.{" "}
            <a
              href="https://docs.metamask.io/smart-accounts-kit/guides/delegation/execute-on-smart-accounts-behalf/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#E07A5F] hover:underline"
            >
              Learn more →
            </a>
          </p>
        </motion.section>

        {/* Section 5: Fees */}
        <motion.section variants={item}>
          <h3 className="text-white/85 font-medium text-sm mb-1">5. Fees</h3>
          <div className="pl-2.5 border-l border-white/10 text-xs text-white/45 space-y-0.5">
            <p>
              • <span className="text-white/60">Swaps:</span> 0.5% (from input)
            </p>
            <p>
              • <span className="text-white/60">Staking:</span> 0.5% (from
              input)
            </p>
            <p>
              • <span className="text-white/60">All other actions:</span> Free
              (transfers, wrap/unwrap, unstaking)
            </p>
          </div>
          <p className="text-xs text-white/45 mt-1.5">
            Fees are subject to change. Additional actions may incur fees in the
            future and fee rates may be adjusted.
          </p>
        </motion.section>

        {/* Section 6: Disclaimer */}
        <motion.section variants={item}>
          <h3 className="text-white/85 font-medium text-sm mb-1">
            6. Disclaimer
          </h3>
          <p className="mb-0.5">
            <span className="text-white/60">Not Financial Advice.</span> Pragma
            is a tool for executing crypto transactions. We do not provide
            investment advice — always DYOR.
          </p>
          <p className="mb-0.5">
            <span className="text-white/60">AI Limitations.</span> Pragma&apos;s
            AI agent may make mistakes or misinterpret your intent. Always
            review transaction details before confirming.
          </p>
          <p className="mb-0.5">
            <span className="text-white/60">No Guarantees.</span> We make no
            guarantees about prices, protocol availability, or transaction
            success.
          </p>
          <p>
            <span className="text-white/60">Your Responsibility.</span> You are
            solely responsible for your transactions and any losses from market
            movements, protocol failures, or user error.
          </p>
        </motion.section>

        {/* Section 7: Privacy */}
        <motion.section variants={item}>
          <h3 className="text-white/85 font-medium text-sm mb-1">7. Privacy</h3>
          <p className="mb-1.5">
            <span className="text-white/60">Minimal Data Collection.</span>{" "}
            Pragma does not collect or store your personal information.
          </p>
          <div className="pl-2.5 border-l border-white/10 text-xs text-white/45 space-y-0.5">
            <p>• Session keys stored locally in your browser</p>
            <p>• Wallet addresses used only for transaction execution</p>
            <p>• Transaction data visible on public blockchain</p>
            <p>• Chat messages processed by AI but not permanently stored</p>
          </div>
          <p className="text-xs text-white/45 mt-1">
            We do not sell or share your data with third parties.
          </p>
        </motion.section>

        {/* Section 8: Support */}
        <motion.section variants={item}>
          <h3 className="text-white/85 font-medium text-sm mb-1">8. Support</h3>
          <p className="mb-1.5 text-white/60">Need Help?</p>
          <div className="pl-2.5 border-l border-white/10 text-xs text-white/45 space-y-0.5">
            {/* TODO: Add docs link when ready */}
            {/* <p>
              • Docs:{' '}
              <a href="https://docs.pragma.xyz" target="_blank" rel="noopener noreferrer" className="text-[#E07A5F] hover:underline">
                docs.pragma.xyz
              </a>
            </p> */}
            {/* TODO: Add Discord link when ready */}
            {/* <p>
              • Discord:{' '}
              <a href="https://discord.gg/pragma" target="_blank" rel="noopener noreferrer" className="text-[#E07A5F] hover:underline">
                discord.gg/pragma
              </a>
            </p> */}
            <p>
              • X:{" "}
              <a
                href="https://twitter.com/s0nderlabs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#E07A5F] hover:underline"
              >
                @s0nderlabs
              </a>
            </p>
            <p>
              • Email:{" "}
              <a
                href="mailto:s0nderlabs.hq@gmail.com"
                className="text-[#E07A5F] hover:underline"
              >
                s0nderlabs.hq@gmail.com
              </a>
            </p>
          </div>
          <p className="text-xs text-white/45 mt-1">
            Report bugs or security issues via X or email.
          </p>
        </motion.section>

        {/* Spacer to ensure user scrolls past content */}
        <div className="h-4" />
      </motion.div>

      {/* Scroll hint when not yet scrolled */}
      {!hasScrolledToBottom && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-2 text-xs text-white/40"
        >
          ↓ Scroll to read all terms
        </motion.div>
      )}

      {/* Agreement checkbox */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="pt-3 mt-2 border-t border-white/10"
      >
        <label
          className={`flex items-center gap-3 ${
            canCheck ? "cursor-pointer group" : "cursor-not-allowed opacity-50"
          }`}
        >
          <div className="relative">
            <input
              type="checkbox"
              checked={hasAgreed}
              onChange={(e) => canCheck && setAgreed(e.target.checked)}
              disabled={!canCheck}
              className="peer sr-only"
            />
            <div
              className={`w-5 h-5 rounded border-2 transition-all duration-200 ${
                canCheck
                  ? "border-white/20 bg-white/5 peer-checked:border-[#E07A5F] peer-checked:bg-[#E07A5F]"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              {hasAgreed && (
                <svg
                  className="w-full h-full text-white p-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>
          </div>
          <span
            className={`text-sm transition-colors ${
              canCheck
                ? "text-white/70 group-hover:text-white"
                : "text-white/40"
            }`}
          >
            I have read and agree to the Terms of Use
          </span>
        </label>
      </motion.div>
    </div>
  );
}
