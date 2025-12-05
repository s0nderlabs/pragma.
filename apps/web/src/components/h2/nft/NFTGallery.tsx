'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Grid3X3, ImageOff } from 'lucide-react';
import { NFTCard } from './NFTCard';
import type { NFTDisplayData, NFTGalleryData } from '@pragma/core';

interface NFTGalleryProps {
  data: NFTGalleryData;
  onNFTClick?: (nft: NFTDisplayData) => void;
  onBuyClick?: (nft: NFTDisplayData) => void;
  onLoadMore?: () => void;
  itemsPerPage?: number;
}

/**
 * NFT Gallery Component
 *
 * Displays a grid of NFT cards with:
 * - 3x3 or 4x3 grid layout
 * - Pagination
 * - Loading states
 * - Empty state
 */
export function NFTGallery({
  data,
  onNFTClick,
  onBuyClick,
  onLoadMore,
  itemsPerPage = 9,
}: NFTGalleryProps) {
  const [currentPage, setCurrentPage] = useState(0);

  const { nfts, title, mode, totalCount, nextCursor } = data;

  // Calculate pagination
  const totalPages = Math.ceil(nfts.length / itemsPerPage);
  const startIndex = currentPage * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentNFTs = nfts.slice(startIndex, endIndex);

  // Navigation handlers
  const goToPrevPage = () => setCurrentPage((p) => Math.max(0, p - 1));
  const goToNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage((p) => p + 1);
    } else if (nextCursor && onLoadMore) {
      onLoadMore();
    }
  };

  // Empty state
  if (nfts.length === 0) {
    return (
      <div className="rounded-2xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.06] p-8">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-white/[0.03] flex items-center justify-center mb-4">
            <ImageOff className="w-8 h-8 text-gray-400 dark:text-white/20" />
          </div>
          <p className="text-sm text-gray-600 dark:text-white/60 mb-1">
            {mode === 'owned' ? 'No NFTs found' : 'No listings found'}
          </p>
          <p className="text-xs text-gray-400 dark:text-white/40">
            {mode === 'owned'
              ? 'Your NFT collection will appear here'
              : 'Try a different collection or check back later'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Grid3X3 className="w-4 h-4 text-gray-400 dark:text-white/40" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">{title}</span>
          {totalCount !== undefined && (
            <span className="text-xs text-gray-400 dark:text-white/40">({totalCount})</span>
          )}
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
              disabled={currentPage === totalPages - 1 && !nextCursor}
              className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-500 dark:text-white/60" />
            </button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-3 gap-3"
          >
            {currentNFTs.map((displayData, index) => (
              <NFTCard
                key={`${displayData.nft.contract}-${displayData.nft.identifier}-${index}`}
                nft={displayData.nft}
                onClick={() => onNFTClick?.(displayData)}
                showPrice={mode === 'browse' && !!displayData.formattedPrice}
                price={displayData.formattedPrice}
                canBuy={displayData.canBuy}
                onBuy={() => onBuyClick?.(displayData)}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Load More */}
      {nextCursor && onLoadMore && (
        <div className="px-4 pb-4">
          <button
            onClick={onLoadMore}
            className="w-full py-2 text-xs text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.02] rounded-lg transition-colors"
          >
            Load more NFTs
          </button>
        </div>
      )}
    </div>
  );
}
