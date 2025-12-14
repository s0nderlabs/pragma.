'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ImageOff, RefreshCw, Loader2, Image } from 'lucide-react';
import { useH2ChatStore } from '@/stores/useH2ChatStore';
import { NFTCard } from '../../nft/NFTCard';
import { authenticatedFetch } from '@/lib/api/authenticatedFetch';
import type { NFT } from '@pragma/core';

interface NFTsTabState {
  nfts: NFT[];
  isLoading: boolean;
  error: string | null;
  nextCursor: string | null;
}

/**
 * NFTs Tab Component
 *
 * Displays user's owned NFTs in a grid layout.
 * Fetches from OpenSea API via proxy.
 */
export function NFTsTab() {
  const sessionData = useH2ChatStore((state) => state.sessionData);
  const smartAccountAddress = sessionData?.delegator;

  const [state, setState] = useState<NFTsTabState>({
    nfts: [],
    isLoading: true,
    error: null,
    nextCursor: null,
  });

  // Fetch NFTs from OpenSea API proxy
  const fetchNFTs = useCallback(async (cursor?: string) => {
    if (!smartAccountAddress) {
      setState((prev) => ({ ...prev, isLoading: false, error: 'No wallet connected' }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const params = new URLSearchParams({
        address: smartAccountAddress,
        limit: '20',
      });
      if (cursor) params.set('next', cursor);

      const response = await authenticatedFetch(`/api/opensea/nfts?${params.toString()}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(errorText);
      }

      const data = (await response.json()) as { nfts: NFT[]; next?: string };

      setState((prev) => ({
        ...prev,
        nfts: cursor ? [...prev.nfts, ...data.nfts] : data.nfts,
        nextCursor: data.next || null,
        isLoading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch NFTs';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
    }
  }, [smartAccountAddress]);

  // Initial fetch
  useEffect(() => {
    fetchNFTs();
  }, [fetchNFTs]);

  // Refresh handler
  const handleRefresh = () => {
    setState((prev) => ({ ...prev, nfts: [], nextCursor: null }));
    fetchNFTs();
  };

  // Load more handler
  const handleLoadMore = () => {
    if (state.nextCursor && !state.isLoading) {
      fetchNFTs(state.nextCursor);
    }
  };

  // Loading state (initial)
  if (state.isLoading && state.nfts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Loader2 className="w-8 h-8 text-white/30 animate-spin mb-4" />
        <p className="text-sm text-white/60">Loading NFTs...</p>
      </div>
    );
  }

  // No wallet connected - show neutral empty state (not an error)
  if (state.error === 'No wallet connected' && state.nfts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="flex items-center justify-center mb-4">
          <Image className="w-8 h-8 text-white/30" />
        </div>
        <p className="text-sm text-white/60 mb-1">No NFTs yet</p>
        <p className="text-xs text-white/40">Your NFT collection will appear here</p>
      </div>
    );
  }

  // Error state (actual API errors)
  if (state.error && state.nfts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <ImageOff className="w-6 h-6 text-red-400" />
        </div>
        <p className="text-sm text-gray-400 mb-2">Failed to load NFTs</p>
        <p className="text-xs text-gray-500 mb-4">{state.error}</p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 text-xs bg-white/[0.05] hover:bg-white/[0.08] rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (state.nfts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="flex items-center justify-center mb-4">
          <ImageOff className="w-8 h-8 text-white/30" />
        </div>
        <p className="text-sm text-white/60 mb-1">No NFTs found</p>
        <p className="text-xs text-white/40">Your NFT collection will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40">{state.nfts.length} NFTs</span>
        <button
          onClick={handleRefresh}
          disabled={state.isLoading}
          className="p-1.5 rounded-lg hover:bg-white/[0.05] disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-white/40 ${state.isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3">
        {state.nfts.map((nft, index) => (
          <motion.div
            key={`${nft.contract}-${nft.identifier}-${index}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.02 }}
          >
            <NFTCard nft={nft} compact />
          </motion.div>
        ))}
      </div>

      {/* Load more button */}
      {state.nextCursor && (
        <button
          onClick={handleLoadMore}
          disabled={state.isLoading}
          className="w-full py-3 text-xs text-white/40 hover:text-white/60 hover:bg-white/[0.02] rounded-lg transition-colors disabled:opacity-50"
        >
          {state.isLoading ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
