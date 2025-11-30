'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Coins } from 'lucide-react';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useH2ChatStore } from '@/stores/useH2ChatStore';
import { getTokenLogo, initTokenLogos } from '@/lib/token-logos';
import { formatUnits } from 'viem';

/** Filter out tokens worth less than this USD amount */
const USD_DUST_THRESHOLD = 0.01;

interface DisplayToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  usdValue: string;
  logo?: string;
  verified: boolean;
}

export function BalancesTab() {
  const { allTokens, error, refresh } = useWalletBalance();
  const setBalanceRefreshCallback = useH2ChatStore((state) => state.setBalanceRefreshCallback);
  const [showDust, setShowDust] = useState(false);

  // Register refresh callback for immediate updates after transactions
  useEffect(() => {
    setBalanceRefreshCallback(refresh);
    return () => setBalanceRefreshCallback(null);
  }, [refresh, setBalanceRefreshCallback]);

  // Initialize token logos from Monorail API
  useEffect(() => {
    initTokenLogos();
  }, []);

  // Transform Monorail tokens to display format
  const displayTokens = useMemo(() => {
    const tokens: DisplayToken[] = allTokens
      .map((token) => {
        // Parse balance (comes as raw string)
        let formattedBalance: string;
        try {
          const balanceBigInt = BigInt(token.balance);
          formattedBalance = formatUnits(balanceBigInt, token.decimals);
        } catch {
          // If already formatted, use as-is
          formattedBalance = token.balance;
        }

        // Calculate USD value from balance × usd_per_token
        let usdValue = '0';
        try {
          const balanceNum = parseFloat(formattedBalance);
          const pricePerToken = parseFloat(token.usd_per_token || '0');
          if (!isNaN(balanceNum) && !isNaN(pricePerToken) && pricePerToken > 0) {
            usdValue = (balanceNum * pricePerToken).toString();
          }
        } catch {
          // If calculation fails, default to 0
          usdValue = '0';
        }

        return {
          address: token.address.toLowerCase(),
          symbol: token.symbol || 'UNKNOWN',
          name: token.name || 'Unknown Token',
          decimals: token.decimals,
          balance: formattedBalance,
          usdValue,
          logo: getTokenLogo(token.address),
          verified: token.categories?.includes('verified') || false,
        };
      })
      // Filter dust by USD value (keeps high-value tokens even with small amounts)
      .filter((token) => {
        if (showDust) return true;
        const usdValue = parseFloat(token.usdValue) || 0;
        return usdValue >= USD_DUST_THRESHOLD;
      })
      // Sort by USD value (highest first)
      .sort((a, b) => {
        const aValue = parseFloat(a.usdValue) || 0;
        const bValue = parseFloat(b.usdValue) || 0;
        return bValue - aValue;
      });

    return tokens;
  }, [allTokens, showDust]);

  // Count how many tokens are hidden by dust filter (must be before early returns per React rules of hooks)
  const dustCount = useMemo(() => {
    if (showDust) return 0;
    return allTokens.filter((token) => {
      let usdValue = 0;
      try {
        const balanceBigInt = BigInt(token.balance);
        const formattedBalance = formatUnits(balanceBigInt, token.decimals);
        const balanceNum = parseFloat(formattedBalance);
        const pricePerToken = parseFloat(token.usd_per_token || '0');
        if (!isNaN(balanceNum) && !isNaN(pricePerToken) && pricePerToken > 0) {
          usdValue = balanceNum * pricePerToken;
        }
      } catch {
        // Ignore
      }
      return usdValue < USD_DUST_THRESHOLD;
    }).length;
  }, [allTokens, showDust]);

  // Format balance for display
  const formatBalance = (balance: string): string => {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.0001) return '<0.0001';
    if (num < 1) return num.toFixed(4);
    if (num < 1000) return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  // Format USD value
  const formatUsdValue = (usdValue: string): string => {
    const num = parseFloat(usdValue);
    if (num === 0) return '$0.00';
    if (num < 0.01) return '<$0.01';
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <Coins className="w-6 h-6 text-red-400" />
        </div>
        <p className="text-sm text-gray-400 mb-2">Failed to load balances</p>
        <p className="text-xs text-gray-500">{error}</p>
        <button
          onClick={refresh}
          className="mt-4 px-4 py-2 text-xs bg-[#1A1D23] hover:bg-[#252930] rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (displayTokens.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="flex items-center justify-center mb-4">
          <Coins className="w-8 h-8 text-white/30" />
        </div>
        <p className="text-sm text-white/60 mb-1">No tokens found</p>
        <p className="text-xs text-white/40">Your balance will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-0 will-change-scroll">
      {displayTokens.map((token, index) => (
        <motion.div
          key={token.address}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: index * 0.03 }}
          className="py-4 -mx-4 px-4 rounded-3xl transition-colors duration-200 hover:bg-white/[0.02]"
        >
          <div className="flex items-start justify-between gap-3">
            {/* Left: Token Logo and Info */}
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {/* Token Logo */}
              <div className="relative w-10 h-10 flex-shrink-0">
                {token.logo ? (
                  <img
                    src={token.logo}
                    alt={token.symbol}
                    className="w-full h-full rounded-full object-cover"
                    onError={(e) => {
                      // Fallback to icon if image fails to load
                      e.currentTarget.style.display = 'none';
                      const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div
                  className="absolute inset-0 w-full h-full rounded-full bg-white/5 items-center justify-center hidden"
                  style={{ display: token.logo ? 'none' : 'flex' }}
                >
                  <Coins className="w-5 h-5 text-white/40" />
                </div>
              </div>

              {/* Token Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate mb-0.5">{token.symbol}</p>
                <p className="text-xs text-white/60 truncate">{token.name}</p>
              </div>
            </div>

            {/* Right: Balance & USD Value */}
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-medium text-white mb-0.5">{formatBalance(token.balance)}</p>
              <p className="text-xs text-white/40">{formatUsdValue(token.usdValue)}</p>
            </div>
          </div>
        </motion.div>
      ))}

      {/* Dust toggle */}
      {(dustCount > 0 || showDust) && (
        <button
          onClick={() => setShowDust(!showDust)}
          className="w-full py-3 text-xs text-white/40 hover:text-white/60 transition-colors"
        >
          {showDust ? 'Show fewer tokens' : 'Show all tokens'}
        </button>
      )}
    </div>
  );
}
