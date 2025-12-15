/**
 * RotateSessionKeyModal Component
 *
 * Two-phase modal for rotating session keys with optional fund transfer.
 * Transfer BEFORE rotate to prevent orphaned funds.
 */

"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  X,
  RefreshCw,
  Wallet,
  Key,
  ArrowRight,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { type Address, type Hex, formatEther, http, createPublicClient } from "viem";
import {
  executeQuickRotation,
  type FundDestination,
  type RotationResult,
} from "@/lib/session/sessionKeyRotation";
import { useH2Session } from "@/hooks/useH2Session";
import { useSessionKeyBalance } from "@/hooks/useSessionKeyBalance";
import { MONAD_RPC_URL } from "@/lib/config";
import { monadDevnet } from "@/lib/chains";

// ============================================================================
// Types
// ============================================================================

interface RotateSessionKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  smartAccountAddress: Address;
}

type RotationPhase =
  | "confirm"
  | "transferring"
  | "rotating"
  | "complete"
  | "error";

// ============================================================================
// Constants
// ============================================================================

const MIN_TRANSFER_THRESHOLD = 0.01; // MON

// ============================================================================
// Component
// ============================================================================

export function RotateSessionKeyModal({
  isOpen,
  onClose,
  smartAccountAddress,
}: RotateSessionKeyModalProps) {
  const [phase, setPhase] = useState<RotationPhase>("confirm");
  const [destination, setDestination] =
    useState<FundDestination>("new_session_key");
  const [result, setResult] = useState<RotationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { sessionData, setSessionData } = useH2Session();

  // Create publicClient for balance checks
  const publicClient = createPublicClient({
    chain: monadDevnet,
    transport: http(MONAD_RPC_URL),
  });

  const sessionKeyAddress = sessionData?.sessionKeyAddress as Address | undefined;
  const sessionKeyPrivateKey = sessionData?.sessionKeyPrivateKey as Hex | undefined;
  const delegator = sessionData?.delegator as Address | undefined;

  const { balance, balanceFormatted, isLoading: balanceLoading } =
    useSessionKeyBalance(sessionKeyAddress);

  const canTransfer =
    balance !== null && Number(formatEther(balance)) >= MIN_TRANSFER_THRESHOLD;

  /**
   * Execute the rotation flow
   */
  const handleRotate = useCallback(async () => {
    if (!sessionKeyAddress || !sessionKeyPrivateKey || !delegator || !publicClient) {
      setErrorMessage("Session data incomplete. Please reconnect.");
      setPhase("error");
      return;
    }

    try {
      // Phase 1: Transfer (if applicable)
      if (canTransfer) {
        setPhase("transferring");
      } else {
        setPhase("rotating");
      }

      // Execute rotation with optional transfer
      const rotationResult = await executeQuickRotation({
        delegator,
        oldSessionKeyAddress: sessionKeyAddress,
        oldSessionKeyPrivateKey: sessionKeyPrivateKey,
        destination,
        publicClient,
        transport: http(MONAD_RPC_URL),
        smartAccountAddress,
      });

      if (!rotationResult.success) {
        setErrorMessage(rotationResult.error || "Rotation failed");
        setPhase("error");
        return;
      }

      // Update session data with new key
      setSessionData({
        ...sessionData!,
        sessionKeyAddress: rotationResult.newSessionKey.address,
        sessionKeyPrivateKey: rotationResult.newSessionKey.privateKey,
      });

      setResult(rotationResult);
      setPhase("complete");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setPhase("error");
    }
  }, [
    sessionKeyAddress,
    sessionKeyPrivateKey,
    delegator,
    publicClient,
    canTransfer,
    destination,
    smartAccountAddress,
    sessionData,
    setSessionData,
  ]);

  /**
   * Reset and close modal
   */
  const handleClose = useCallback(() => {
    setPhase("confirm");
    setDestination("new_session_key");
    setResult(null);
    setErrorMessage(null);
    onClose();
  }, [onClose]);

  /**
   * Retry after error
   */
  const handleRetry = useCallback(() => {
    setPhase("confirm");
    setErrorMessage(null);
    setResult(null);
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
              <div className="p-2 rounded-lg bg-blue-500/20">
                <RefreshCw className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-white/90">
                  Rotate Session Key
                </DialogTitle>
                <p className="text-xs text-white/50 mt-0.5">
                  Generate a new session key for security
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-white/5 rounded transition-colors flex-shrink-0"
              disabled={phase === "transferring" || phase === "rotating"}
            >
              <X className="w-4 h-4 text-white/40" />
            </button>
          </div>

          {/* Content by Phase */}
          <AnimatePresence mode="wait">
            {phase === "confirm" && (
              <ConfirmPhase
                balance={balance}
                balanceFormatted={balanceFormatted}
                balanceLoading={balanceLoading}
                canTransfer={canTransfer}
                destination={destination}
                setDestination={setDestination}
                onConfirm={handleRotate}
                onCancel={handleClose}
              />
            )}

            {phase === "transferring" && (
              <ProgressPhase
                icon={<Wallet className="w-5 h-5 text-blue-400" />}
                title="Transferring Funds"
                description={`Sending ${balanceFormatted} MON to ${destination === "new_session_key" ? "new session key" : "smart account"}...`}
              />
            )}

            {phase === "rotating" && (
              <ProgressPhase
                icon={<Key className="w-5 h-5 text-blue-400" />}
                title="Generating New Key"
                description="Creating new session key and updating storage..."
              />
            )}

            {phase === "complete" && result && (
              <CompletePhase
                result={result}
                destination={destination}
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

interface ConfirmPhaseProps {
  balance: bigint | null;
  balanceFormatted: string | null;
  balanceLoading: boolean;
  canTransfer: boolean;
  destination: FundDestination;
  setDestination: (d: FundDestination) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmPhase({
  balance,
  balanceFormatted,
  balanceLoading,
  canTransfer,
  destination,
  setDestination,
  onConfirm,
  onCancel,
}: ConfirmPhaseProps) {
  return (
    <motion.div
      key="confirm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      {/* Balance Display */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/60">Current Balance</span>
          {balanceLoading ? (
            <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
          ) : (
            <span className="text-sm font-mono text-white">
              {balanceFormatted ?? "0"} MON
            </span>
          )}
        </div>
      </div>

      {/* Transfer Destination (only if can transfer) */}
      {canTransfer && (
        <div className="space-y-2">
          <label className="text-sm text-white/60">Transfer funds to:</label>
          <div className="space-y-2">
            <DestinationOption
              id="new_session_key"
              label="New Session Key"
              description="Funds will be available for the new key to use"
              icon={<Key className="w-4 h-4" />}
              selected={destination === "new_session_key"}
              onSelect={() => setDestination("new_session_key")}
            />
            <DestinationOption
              id="smart_account"
              label="Smart Account"
              description="Withdraw funds back to your smart account"
              icon={<Wallet className="w-4 h-4" />}
              selected={destination === "smart_account"}
              onSelect={() => setDestination("smart_account")}
            />
          </div>
        </div>
      )}

      {/* Low Balance Warning */}
      {!canTransfer && balance !== null && balance > 0n && (
        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-xs text-yellow-400">
            Balance too low to cover transfer gas. Funds will remain in old key.
          </p>
        </div>
      )}

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
          className="flex-1 py-2.5 px-4 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-400 transition-colors font-medium text-sm flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Rotate Key
        </button>
      </div>

      {/* Info */}
      <p className="text-[11px] text-white/30 text-center">
        Your session key will be immediately replaced. The agent will use the
        new key for all future operations.
      </p>
    </motion.div>
  );
}

interface DestinationOptionProps {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
}

function DestinationOption({
  id,
  label,
  description,
  icon,
  selected,
  onSelect,
}: DestinationOptionProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full p-3 rounded-lg border transition-colors text-left flex items-start gap-3 ${
        selected
          ? "bg-blue-500/10 border-blue-500/30"
          : "bg-white/5 border-white/10 hover:bg-white/10"
      }`}
    >
      <div
        className={`p-1.5 rounded ${selected ? "bg-blue-500/20 text-blue-400" : "bg-white/10 text-white/50"}`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-white/90">{label}</div>
        <div className="text-xs text-white/50">{description}</div>
      </div>
      <div
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
          selected ? "border-blue-400 bg-blue-400" : "border-white/30"
        }`}
      >
        {selected && <Check className="w-2.5 h-2.5 text-black" />}
      </div>
    </button>
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
      <div className="p-4 rounded-full bg-blue-500/20 animate-pulse">{icon}</div>
      <div>
        <h3 className="text-base font-medium text-white/90">{title}</h3>
        <p className="text-sm text-white/50 mt-1">{description}</p>
      </div>
      <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
    </motion.div>
  );
}

interface CompletePhaseProps {
  result: RotationResult;
  destination: FundDestination;
  onClose: () => void;
}

function CompletePhase({ result, destination, onClose }: CompletePhaseProps) {
  const transferred = result.transferResult?.transferredAmount;
  const transferredFormatted = transferred
    ? formatEther(transferred)
    : null;

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
          Session Key Rotated
        </h3>
        <p className="text-sm text-white/50 mt-1">
          Your new session key is now active
        </p>
      </div>

      {/* New Key Address */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
        <div className="text-xs text-white/50 mb-1">New Session Key</div>
        <div className="font-mono text-xs text-white/80 break-all">
          {result.newSessionKey.address}
        </div>
      </div>

      {/* Transfer Summary (if applicable) */}
      {transferredFormatted && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-2 text-sm text-green-400">
            <ArrowRight className="w-4 h-4" />
            <span>
              {transferredFormatted} MON transferred to{" "}
              {destination === "new_session_key" ? "new key" : "smart account"}
            </span>
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
        <h3 className="text-base font-medium text-red-400">Rotation Failed</h3>
        <p className="text-sm text-white/50 mt-2">{message}</p>
      </div>

      {/* Info */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
        <p className="text-xs text-white/50">
          Your session key and funds are safe. The rotation was aborted before
          any changes were made.
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
