"use client";

/**
 * Treasury Card Component
 *
 * Displays live treasury portfolio with token breakdown.
 * Fetches data from Monorail API via /api/admin/treasury.
 */

import { useState, useEffect, useCallback } from "react";
import { Wallet, RefreshCw, ExternalLink } from "lucide-react";
import { BentoCard } from "./BentoGrid";

interface TreasuryToken {
  address: string;
  symbol: string;
  name: string;
  balance: number;
  price: number;
  usdValue: number;
  logoUrl?: string;
}

interface TreasuryData {
  address: string;
  totalUsd: number;
  tokens: TreasuryToken[];
  lastUpdated: string;
}

interface TreasuryCardProps {
  onRefresh?: () => void;
}

export function TreasuryCard({ onRefresh }: TreasuryCardProps) {
  const [treasury, setTreasury] = useState<TreasuryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchTreasury = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/treasury");
      if (!response.ok) {
        throw new Error("Failed to fetch treasury");
      }
      const data = await response.json();
      setTreasury(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTreasury();
  }, [fetchTreasury]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchTreasury();
    onRefresh?.();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatBalance = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(2)}K`;
    if (value < 0.01 && value > 0) return value.toFixed(6);
    return value.toFixed(4);
  };

  const formatPrice = (value: number) => {
    if (value < 0.01) return `$${value.toFixed(6)}`;
    if (value < 1) return `$${value.toFixed(4)}`;
    return `$${value.toFixed(2)}`;
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (error) {
    return (
      <BentoCard variant="green">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-white/70 font-raleway">
              Treasury Balance
            </p>
            <p className="text-sm mt-2 text-white/80 font-raleway">{error}</p>
          </div>
          <Wallet className="w-5 h-5 text-white" />
        </div>
      </BentoCard>
    );
  }

  return (
    <BentoCard variant="green" className="relative flex flex-col h-[292px] overflow-hidden">
      <div className="flex items-start justify-between flex-shrink-0">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium tracking-wide text-white/70 font-raleway">
              Treasury Balance
            </p>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw
                className={`w-3 h-3 text-white/70 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </button>
          </div>
          <p className="text-2xl font-semibold mt-1 tabular-nums text-white font-cal">
            {isLoading ? "..." : formatCurrency(treasury?.totalUsd ?? 0)}
          </p>
          {treasury?.address && (
            <a
              href={`https://monadexplorer.com/address/${treasury.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs mt-1 text-white/60 hover:text-white/80 font-raleway flex items-center gap-1"
            >
              {truncateAddress(treasury.address)}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <Wallet className="w-5 h-5 text-white" />
      </div>

      {/* Token list - always visible with scroll */}
      {treasury && treasury.tokens.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/10 flex-1 overflow-hidden">
          <p className="text-xs text-white/50 font-raleway mb-2">
            {treasury.tokens.length} tokens
          </p>
          <div className="space-y-2 overflow-y-auto h-[calc(100%-20px)] pr-1">
            {treasury.tokens.map((token) => (
              <div
                key={token.address}
                className="flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  {token.logoUrl ? (
                    <img
                      src={token.logoUrl}
                      alt={token.symbol}
                      className="w-5 h-5 rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-medium text-white">
                      {token.symbol.charAt(0)}
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-white">{token.symbol}</span>
                    <span className="text-white/50 ml-1">
                      {formatBalance(token.balance)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-white font-medium">
                    {formatCurrency(token.usdValue)}
                  </span>
                  <span className="text-white/50 ml-1 text-[10px]">
                    @ {formatPrice(token.price)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </BentoCard>
  );
}
