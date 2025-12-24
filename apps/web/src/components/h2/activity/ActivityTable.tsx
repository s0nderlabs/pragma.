'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Activity, Copy, Check, ExternalLink, Sparkles } from 'lucide-react';

// ============================================================================
// Portal Tooltip Component (renders outside overflow containers)
// ============================================================================

function PortalTooltip({
  children,
  text,
  className = ''
}: {
  children: React.ReactNode;
  text: string;
  className?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8,
      });
      setIsVisible(true);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsVisible(false);
    setPosition(null);
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={className}
      >
        {children}
      </div>
      {isVisible && position && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[9999] px-2.5 py-1 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium whitespace-nowrap shadow-lg pointer-events-none"
          style={{
            left: position.x,
            top: position.y,
            transform: 'translateX(-50%)',
          }}
        >
          {text}
          <span className="absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 bg-gray-900 dark:bg-white rotate-45" />
        </div>,
        document.body
      )}
    </>
  );
}

// ============================================================================
// Types
// ============================================================================

export interface ActivityItem {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  type: string;
  typeDescription?: string;
  tokenIn?: {
    address: string;
    symbol: string;
    amount: string;
    amountFormatted: string;
    valueUsd?: string;
  };
  tokenOut?: {
    address: string;
    symbol: string;
    amount: string;
    amountFormatted: string;
    valueUsd?: string;
  };
  gasFee?: string;
  gasFeeFormatted?: string;
  from?: string;    // Sender address
  to?: string;      // Receiver address
  protocol?: string;
  counterparty?: string; // Recipient for transfers, spender for approvals
}

export interface ActivityTableData {
  activities: ActivityItem[];
  totalCount: number;
  page: number;
  totalPages: number;
  timeRange: string;
  address: string;
}

interface ActivityTableProps {
  data: ActivityTableData;
  onExplainClick?: (txHash: string) => void;
  itemsPerPage?: number;
}

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatActivityType(type: string): string {
  const typeMap: Record<string, string> = {
    swap: 'Swap',
    stake: 'Stake',
    unstake_request: 'Unstake Request',
    unstake_claim: 'Unstake Claim',
    transfer: 'Transfer',
    transfer_in: 'Received',
    transfer_out: 'Send',
    wrap: 'Wrap',
    unwrap: 'Unwrap',
    nft_purchase: 'NFT Buy',
    approve: 'Approve',
    native_transfer: 'Send',
  };
  return typeMap[type.toLowerCase()] || type;
}

function truncateHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function truncateAddress(address: string): string {
  if (!address || address === 'unknown' || address.length < 10) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatAmount(amountFormatted: string): string {
  // Handle non-numeric values like "unlimited" for approvals
  const num = parseFloat(amountFormatted);
  if (isNaN(num)) {
    return amountFormatted; // Return as-is (e.g., "unlimited")
  }
  // Format number with appropriate precision
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  if (num < 1) return num.toFixed(4);
  if (num < 1000) return num.toFixed(2);
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Generate a human-readable summary for an activity
 */
function generateSummary(activity: ActivityItem): string {
  const type = activity.type.toLowerCase();
  const tokenIn = activity.tokenIn;
  const tokenOut = activity.tokenOut;
  const counterparty = activity.counterparty ? truncateAddress(activity.counterparty) : '';

  switch (type) {
    case 'swap':
      if (tokenIn && tokenOut) {
        return `Swap ${formatAmount(tokenIn.amountFormatted)} ${tokenIn.symbol} for ${formatAmount(tokenOut.amountFormatted)} ${tokenOut.symbol}`;
      }
      return 'Swap tokens';

    case 'nft_purchase':
      if (tokenIn && tokenOut) {
        return `Buy ${tokenOut.symbol} for ${formatAmount(tokenIn.amountFormatted)} ${tokenIn.symbol}`;
      }
      if (tokenOut) {
        return `Buy ${tokenOut.symbol}`;
      }
      return 'NFT purchase';

    case 'stake':
      if (tokenIn) {
        return `Stake ${formatAmount(tokenIn.amountFormatted)} ${tokenIn.symbol}`;
      }
      return 'Stake tokens';

    case 'unstake_request':
      if (tokenIn) {
        return `Request unstake ${formatAmount(tokenIn.amountFormatted)} ${tokenIn.symbol}`;
      }
      return 'Request unstake';

    case 'unstake_claim':
      if (tokenOut) {
        return `Claim ${formatAmount(tokenOut.amountFormatted)} ${tokenOut.symbol}`;
      }
      return 'Claim unstaked funds';

    case 'transfer_in':
      if (tokenIn) {
        // Use activity.from if available, fall back to counterparty
        const sender = activity.from ? truncateAddress(activity.from) : counterparty;
        const fromText = sender ? ` from ${sender}` : '';
        return `Receive ${formatAmount(tokenIn.amountFormatted)} ${tokenIn.symbol}${fromText}`;
      }
      return 'Received tokens';

    case 'transfer_out':
      if (tokenOut) {
        // Use activity.to if available, fall back to counterparty
        const recipient = activity.to ? truncateAddress(activity.to) : counterparty;
        const toText = recipient ? ` to ${recipient}` : '';
        return `Send ${formatAmount(tokenOut.amountFormatted)} ${tokenOut.symbol}${toText}`;
      }
      return 'Sent tokens';

    case 'transfer':
    case 'native_transfer':
      if (tokenIn) {
        const to = counterparty ? ` to ${counterparty}` : '';
        return `Send ${formatAmount(tokenIn.amountFormatted)} ${tokenIn.symbol}${to}`;
      }
      if (tokenOut) {
        const from = counterparty ? ` from ${counterparty}` : '';
        return `Receive ${formatAmount(tokenOut.amountFormatted)} ${tokenOut.symbol}${from}`;
      }
      return 'Transfer';

    case 'wrap':
      if (tokenIn && tokenOut) {
        return `Wrap ${formatAmount(tokenIn.amountFormatted)} ${tokenIn.symbol} to ${tokenOut.symbol}`;
      }
      return 'Wrap tokens';

    case 'unwrap':
      if (tokenIn && tokenOut) {
        return `Unwrap ${formatAmount(tokenIn.amountFormatted)} ${tokenIn.symbol} to ${tokenOut.symbol}`;
      }
      return 'Unwrap tokens';

    case 'approve':
      if (tokenOut) {
        const amount = tokenOut.amountFormatted === 'unlimited' ? 'unlimited' : formatAmount(tokenOut.amountFormatted);
        const spender = counterparty ? ` to ${counterparty}` : '';
        return `Approve ${amount} ${tokenOut.symbol}${spender}`;
      }
      return 'Token approval';

    default:
      // Generic fallback
      if (tokenIn && tokenOut) {
        return `${formatAmount(tokenIn.amountFormatted)} ${tokenIn.symbol} → ${formatAmount(tokenOut.amountFormatted)} ${tokenOut.symbol}`;
      }
      if (tokenIn) {
        return `${formatAmount(tokenIn.amountFormatted)} ${tokenIn.symbol}`;
      }
      if (tokenOut) {
        return `${formatAmount(tokenOut.amountFormatted)} ${tokenOut.symbol}`;
      }
      return activity.typeDescription || type;
  }
}

// ============================================================================
// Component
// ============================================================================

export function ActivityTable({
  data,
  onExplainClick,
  itemsPerPage = 10,
}: ActivityTableProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const { activities, totalCount, timeRange, address } = data;

  // Calculate pagination
  const totalPages = Math.ceil(activities.length / itemsPerPage);
  const startIndex = currentPage * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentActivities = activities.slice(startIndex, endIndex);

  // Navigation handlers
  const goToPrevPage = () => setCurrentPage((p) => Math.max(0, p - 1));
  const goToNextPage = () => setCurrentPage((p) => Math.min(totalPages - 1, p + 1));

  // Copy handler
  const handleCopy = useCallback(async (hash: string) => {
    await navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  }, []);

  // Explorer link
  const getExplorerUrl = (hash: string) => `https://monadvision.com/tx/${hash}`;

  // Empty state
  if (activities.length === 0) {
    return (
      <div className="rounded-2xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.06] p-8">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-white/[0.03] flex items-center justify-center mb-4">
            <Activity className="w-8 h-8 text-gray-400 dark:text-white/20" />
          </div>
          <p className="text-sm text-gray-600 dark:text-white/60 mb-1">
            No activity found
          </p>
          <p className="text-xs text-gray-400 dark:text-white/40">
            No transactions in the last {timeRange}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-400 dark:text-white/40" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Activity
          </span>
          <span className="text-xs text-gray-400 dark:text-white/40">
            Last {timeRange}
          </span>
          <span className="text-xs text-gray-400 dark:text-white/40">
            ({totalCount})
          </span>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevPage}
              disabled={currentPage === 0}
              className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-white/60" />
            </button>
            <span className="text-xs text-gray-500 dark:text-white/50 min-w-[60px] text-center">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={goToNextPage}
              disabled={currentPage === totalPages - 1}
              className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-500 dark:text-white/60" />
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <AnimatePresence mode="wait">
          <motion.table
            key={currentPage}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="w-full text-sm"
          >
            <thead className="bg-gray-100 dark:bg-white/[0.02]">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-white/40 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-white/40 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-white/40 uppercase tracking-wider">
                  Summary
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-white/40 uppercase tracking-wider">
                  Protocol
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-white/40 uppercase tracking-wider">
                  Tx Hash
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.03]">
              {currentActivities.map((activity) => (
                <tr
                  key={activity.txHash}
                  className="hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors relative"
                >
                  <td className="px-4 py-3 text-gray-600 dark:text-white/70 whitespace-nowrap">
                    {formatRelativeTime(activity.timestamp)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 dark:bg-white/[0.08] text-gray-700 dark:text-white/80">
                      {formatActivityType(activity.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    {generateSummary(activity)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-white/60 whitespace-nowrap">
                    {activity.protocol || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-gray-500 dark:text-white/50 font-mono">
                        {truncateHash(activity.txHash)}
                      </code>
                      <button
                        onClick={() => handleCopy(activity.txHash)}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                        title="Copy hash"
                      >
                        {copiedHash === activity.txHash ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <Copy className="w-3 h-3 text-gray-400 dark:text-white/30" />
                        )}
                      </button>
                      <a
                        href={getExplorerUrl(activity.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                        title="View in explorer"
                      >
                        <ExternalLink className="w-3 h-3 text-gray-400 dark:text-white/30" />
                      </a>

                      {/* Explain button with portal tooltip */}
                      {onExplainClick && (
                        <PortalTooltip text="Explain this tx">
                          <motion.button
                            onClick={() => onExplainClick(activity.txHash)}
                            whileHover={{ scale: 1.1, rotate: 15 }}
                            whileTap={{ scale: 0.9 }}
                            className="p-1 text-terracotta transition-colors hover:text-terracotta/80"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </motion.button>
                        </PortalTooltip>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </motion.table>
        </AnimatePresence>
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.01]">
        <p className="text-xs text-gray-400 dark:text-white/30">
          Click the <Sparkles className="w-3 h-3 inline text-terracotta" /> button to get a detailed breakdown
        </p>
      </div>
    </div>
  );
}
