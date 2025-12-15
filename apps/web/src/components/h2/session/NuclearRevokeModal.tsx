/**
 * NuclearRevokeModal Component
 *
 * Warning modal for nuclear revoke (on-chain delegation invalidation).
 * This invalidates ALL active delegations and requires Web3Auth signature.
 * After revoke, automatically rotates session key.
 */

"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  X,
  ShieldOff,
  AlertTriangle,
  Key,
  Wallet,
  Check,
  AlertCircle,
  Loader2,
  Shield,
} from "lucide-react";
import { type Address, type Hex, formatEther, http, createPublicClient } from "viem";
import { executeNuclearRevoke } from "@/lib/session/nuclearRevoke";
import {
  executeQuickRotation,
  type FundDestination,
} from "@/lib/session/sessionKeyRotation";
import { useH2Session } from "@/hooks/useH2Session";
import { useSessionKeyBalance } from "@/hooks/useSessionKeyBalance";
import { useH2ChatStore } from "@/stores/useH2ChatStore";
import { useIdentity } from "@/hooks/useIdentity";
import { MONAD_RPC_URL } from "@/lib/config";
import { monadDevnet } from "@/lib/chains";

// ============================================================================
// Types
// ============================================================================

interface NuclearRevokeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type RevokePhase =
  | "warning"
  | "signing"
  | "revoking"
  | "rotating"
  | "complete"
  | "error";

// ============================================================================
// Component
// ============================================================================

export function NuclearRevokeModal({ isOpen, onClose }: NuclearRevokeModalProps) {
  const [phase, setPhase] = useState<RevokePhase>("warning");
  const [destination, setDestination] =
    useState<FundDestination>("new_session_key");
  const [understood, setUnderstood] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [newKeyAddress, setNewKeyAddress] = useState<Address | null>(null);

  const { sessionData, setSessionData } = useH2Session();
  const { wallet } = useIdentity();
  const smartAccount = useH2ChatStore((state) => state.smartAccount);
  const bundlerClient = useH2ChatStore((state) => state.bundlerClient);

  // Create publicClient for balance checks and transaction submission
  const publicClient = createPublicClient({
    chain: monadDevnet,
    transport: http(MONAD_RPC_URL),
  });

  const sessionKeyAddress = sessionData?.sessionKeyAddress as Address | undefined;
  const sessionKeyPrivateKey = sessionData?.sessionKeyPrivateKey as Hex | undefined;
  const delegator = sessionData?.delegator as Address | undefined;

  const { balance, balanceFormatted, isLoading: balanceLoading } =
    useSessionKeyBalance(sessionKeyAddress);

  const canTransfer = balance !== null && balance > 0n;

  /**
   * Execute the nuclear revoke flow
   */
  const handleRevoke = useCallback(async () => {
    if (!wallet?.walletClient || !delegator || !smartAccount || !bundlerClient) {
      setErrorMessage("Missing required components. Please reconnect.");
      setPhase("error");
      return;
    }

    if (!sessionKeyAddress || !sessionKeyPrivateKey || !publicClient) {
      setErrorMessage("Session data incomplete. Please reconnect.");
      setPhase("error");
      return;
    }

    try {
      // Phase 1: Sign with Web3Auth
      setPhase("signing");

      // Phase 2: Submit UserOp to revoke all delegations
      setPhase("revoking");

      const revokeResult = await executeNuclearRevoke({
        walletClient: wallet.walletClient,
        ownerAddress: wallet.address,
        delegator,
        smartAccount,
        bundlerClient,
      });

      if (!revokeResult.success) {
        setErrorMessage(revokeResult.error || "Revocation failed");
        setPhase("error");
        return;
      }

      setTxHash(revokeResult.transactionHash || null);

      // Phase 3: Rotate session key
      setPhase("rotating");

      const rotationResult = await executeQuickRotation({
        delegator,
        oldSessionKeyAddress: sessionKeyAddress,
        oldSessionKeyPrivateKey: sessionKeyPrivateKey,
        destination,
        publicClient,
        transport: http(MONAD_RPC_URL),
        smartAccountAddress: delegator,
      });

      if (!rotationResult.success) {
        // Revoke succeeded but rotation failed - still update storage
        // but warn user
        setErrorMessage(
          `Delegations revoked but key rotation failed: ${rotationResult.error}. ` +
            "Please manually rotate your session key."
        );
        setPhase("error");
        return;
      }

      // Update session data with new key
      setSessionData({
        ...sessionData!,
        sessionKeyAddress: rotationResult.newSessionKey.address,
        sessionKeyPrivateKey: rotationResult.newSessionKey.privateKey,
      });

      setNewKeyAddress(rotationResult.newSessionKey.address);
      setPhase("complete");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setPhase("error");
    }
  }, [
    wallet,
    delegator,
    smartAccount,
    bundlerClient,
    sessionKeyAddress,
    sessionKeyPrivateKey,
    publicClient,
    destination,
    sessionData,
    setSessionData,
  ]);

  /**
   * Reset and close modal
   */
  const handleClose = useCallback(() => {
    setPhase("warning");
    setDestination("new_session_key");
    setUnderstood(false);
    setErrorMessage(null);
    setTxHash(null);
    setNewKeyAddress(null);
    onClose();
  }, [onClose]);

  /**
   * Retry after error
   */
  const handleRetry = useCallback(() => {
    setPhase("warning");
    setErrorMessage(null);
    setUnderstood(false);
  }, []);

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
                <ShieldOff className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-white/90">
                  Revoke All Delegations
                </DialogTitle>
                <p className="text-xs text-white/50 mt-0.5">
                  Nuclear option for compromised keys
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-white/5 rounded transition-colors flex-shrink-0"
              disabled={
                phase === "signing" ||
                phase === "revoking" ||
                phase === "rotating"
              }
            >
              <X className="w-4 h-4 text-white/40" />
            </button>
          </div>

          {/* Content by Phase */}
          <AnimatePresence mode="wait">
            {phase === "warning" && (
              <WarningPhase
                balance={balance}
                balanceFormatted={balanceFormatted}
                balanceLoading={balanceLoading}
                canTransfer={canTransfer}
                destination={destination}
                setDestination={setDestination}
                understood={understood}
                setUnderstood={setUnderstood}
                onConfirm={handleRevoke}
                onCancel={handleClose}
              />
            )}

            {phase === "signing" && (
              <ProgressPhase
                icon={<Key className="w-5 h-5 text-red-400" />}
                title="Requesting Signature"
                description="Please sign with your wallet to authorize revocation..."
              />
            )}

            {phase === "revoking" && (
              <ProgressPhase
                icon={<ShieldOff className="w-5 h-5 text-red-400" />}
                title="Revoking Delegations"
                description="Submitting on-chain transaction to invalidate all delegations..."
              />
            )}

            {phase === "rotating" && (
              <ProgressPhase
                icon={<Key className="w-5 h-5 text-blue-400" />}
                title="Rotating Session Key"
                description="Generating new session key and transferring funds..."
              />
            )}

            {phase === "complete" && (
              <CompletePhase
                txHash={txHash}
                newKeyAddress={newKeyAddress}
                onClose={handleClose}
              />
            )}

            {phase === "error" && (
              <ErrorPhase
                message={errorMessage || "Unknown error"}
                onRetry={handleRetry}
                onClose={handleClose}
              />
            )}
          </AnimatePresence>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

interface WarningPhaseProps {
  balance: bigint | null;
  balanceFormatted: string | null;
  balanceLoading: boolean;
  canTransfer: boolean;
  destination: FundDestination;
  setDestination: (d: FundDestination) => void;
  understood: boolean;
  setUnderstood: (u: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function WarningPhase({
  balance,
  balanceFormatted,
  balanceLoading,
  canTransfer,
  destination,
  setDestination,
  understood,
  setUnderstood,
  onConfirm,
  onCancel,
}: WarningPhaseProps) {
  return (
    <motion.div
      key="warning"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      {/* Critical Warning */}
      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
        <h3 className="font-medium text-red-400 mb-2 flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4" />
          This action cannot be undone
        </h3>
        <ul className="space-y-1.5 text-xs text-white/70">
          <li className="flex gap-2">
            <span className="flex-shrink-0 text-white/40">1.</span>
            <span>
              <strong>ALL active delegations</strong> will be invalidated on-chain
            </span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0 text-white/40">2.</span>
            <span>Any in-flight transactions using old delegations will fail</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0 text-white/40">3.</span>
            <span>A new session key will be automatically generated</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0 text-white/40">4.</span>
            <span>This costs gas (UserOp fee)</span>
          </li>
        </ul>
      </div>

      {/* When to use */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
        <div className="text-xs text-white/60 mb-2 flex items-center gap-2">
          <Shield className="w-3 h-3" />
          When to use this:
        </div>
        <ul className="space-y-1 text-xs text-white/50">
          <li>• You suspect your session key is compromised</li>
          <li>• You shared your session key accidentally</li>
          <li>• You see unauthorized transactions</li>
        </ul>
      </div>

      {/* Balance Display */}
      {canTransfer && (
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-white/60">Session Key Balance</span>
            {balanceLoading ? (
              <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
            ) : (
              <span className="text-sm font-mono text-white">
                {balanceFormatted} MON
              </span>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-xs text-white/50">Transfer to:</label>
            <div className="flex gap-2">
              <button
                onClick={() => setDestination("new_session_key")}
                className={`flex-1 py-2 px-3 rounded-lg text-xs transition-colors ${
                  destination === "new_session_key"
                    ? "bg-blue-500/20 border border-blue-500/30 text-blue-400"
                    : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"
                }`}
              >
                <Key className="w-3 h-3 inline mr-1.5" />
                New Key
              </button>
              <button
                onClick={() => setDestination("smart_account")}
                className={`flex-1 py-2 px-3 rounded-lg text-xs transition-colors ${
                  destination === "smart_account"
                    ? "bg-blue-500/20 border border-blue-500/30 text-blue-400"
                    : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"
                }`}
              >
                <Wallet className="w-3 h-3 inline mr-1.5" />
                Smart Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Checkbox */}
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-2 border-white/20 bg-white/5 checked:bg-red-500 checked:border-red-500 cursor-pointer accent-red-500"
        />
        <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors">
          I understand this will invalidate <strong>all</strong> active
          delegations and cannot be undone
        </span>
      </label>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={!understood}
          className="flex-1 py-2.5 px-4 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 transition-colors font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ShieldOff className="w-4 h-4" />
          Revoke All
        </button>
      </div>
    </motion.div>
  );
}

interface ProgressPhaseProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function ProgressPhase({ icon, title, description }: ProgressPhaseProps) {
  return (
    <motion.div
      key="progress"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="py-8 flex flex-col items-center text-center space-y-4"
    >
      <div className="p-4 rounded-full bg-red-500/20 animate-pulse">{icon}</div>
      <div>
        <h3 className="text-base font-medium text-white/90">{title}</h3>
        <p className="text-sm text-white/50 mt-1">{description}</p>
      </div>
      <Loader2 className="w-6 h-6 text-red-400 animate-spin" />
    </motion.div>
  );
}

interface CompletePhaseProps {
  txHash: Hex | null;
  newKeyAddress: Address | null;
  onClose: () => void;
}

function CompletePhase({ txHash, newKeyAddress, onClose }: CompletePhaseProps) {
  return (
    <motion.div
      key="complete"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="py-6 space-y-4"
    >
      {/* Success Icon */}
      <div className="flex justify-center">
        <div className="p-4 rounded-full bg-green-500/20">
          <Check className="w-8 h-8 text-green-400" />
        </div>
      </div>

      {/* Success Message */}
      <div className="text-center">
        <h3 className="text-base font-medium text-white/90">
          Revocation Complete
        </h3>
        <p className="text-sm text-white/50 mt-1">
          All delegations invalidated and session key rotated
        </p>
      </div>

      {/* Transaction Hash */}
      {txHash && (
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="text-xs text-white/50 mb-1">Transaction Hash</div>
          <div className="font-mono text-xs text-white/80 break-all">
            {txHash}
          </div>
        </div>
      )}

      {/* New Key Address */}
      {newKeyAddress && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="text-xs text-green-400 mb-1">New Session Key</div>
          <div className="font-mono text-xs text-white/80 break-all">
            {newKeyAddress}
          </div>
        </div>
      )}

      {/* Close Button */}
      <button
        onClick={onClose}
        className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white/90 transition-colors font-medium text-sm"
      >
        Done
      </button>
    </motion.div>
  );
}

interface ErrorPhaseProps {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}

function ErrorPhase({ message, onRetry, onClose }: ErrorPhaseProps) {
  return (
    <motion.div
      key="error"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="py-6 space-y-4"
    >
      {/* Error Icon */}
      <div className="flex justify-center">
        <div className="p-4 rounded-full bg-red-500/20">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
      </div>

      {/* Error Message */}
      <div className="text-center">
        <h3 className="text-base font-medium text-red-400">Revocation Failed</h3>
        <p className="text-sm text-white/50 mt-2">{message}</p>
      </div>

      {/* Info */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
        <p className="text-xs text-white/50">
          If the on-chain transaction failed, your delegations are still active.
          You can safely retry.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          onClick={onRetry}
          className="flex-1 py-2.5 px-4 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 transition-colors font-medium text-sm"
        >
          Try Again
        </button>
      </div>
    </motion.div>
  );
}
