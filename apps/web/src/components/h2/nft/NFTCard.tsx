'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ImageOff, ExternalLink } from 'lucide-react';
import type { NFT } from '@pragma/core';

interface NFTCardProps {
  nft: NFT;
  onClick?: () => void;
  showPrice?: boolean;
  price?: string;
  canBuy?: boolean;
  onBuy?: () => void;
  compact?: boolean;
}

/**
 * NFT Card Component
 *
 * Displays a single NFT with:
 * - Image (with fallback)
 * - Name
 * - Collection
 * - Price (if listed)
 * - Buy button (if available)
 */
export function NFTCard({
  nft,
  onClick,
  showPrice = false,
  price,
  canBuy = false,
  onBuy,
  compact = false,
}: NFTCardProps) {
  const [imageError, setImageError] = useState(false);

  // Get display image URL with fallbacks
  const imageUrl = nft.display_image_url || nft.image_url;
  const displayName = nft.name || `#${nft.identifier}`;
  const collectionName = nft.collection || 'Unknown Collection';

  // Truncate long names
  const truncateName = (name: string, maxLength: number) => {
    if (name.length <= maxLength) return name;
    return `${name.slice(0, maxLength - 3)}...`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`
        relative group/nft rounded-2xl overflow-hidden
        bg-gray-100 dark:bg-white/[0.03]
        border border-gray-200 dark:border-white/[0.06]
        hover:border-gray-300 dark:hover:border-white/[0.12]
        hover:bg-gray-50 dark:hover:bg-white/[0.05]
        transition-all duration-200 cursor-pointer
        ${compact ? 'aspect-square' : ''}
      `}
    >
      {/* Image Container */}
      <div className={`relative ${compact ? 'aspect-square' : 'aspect-square'} overflow-hidden`}>
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={displayName}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-white/[0.02]">
            <ImageOff className="w-8 h-8 text-gray-400 dark:text-white/20" />
          </div>
        )}

        {/* Hover overlay with OpenSea link */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/nft:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <a
            href={nft.opensea_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <ExternalLink className="w-5 h-5 text-white" />
          </a>
        </div>
      </div>

      {/* Info Section */}
      {!compact && (
        <div className="p-3 space-y-1">
          {/* Name */}
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={displayName}>
            {truncateName(displayName, 20)}
          </p>

          {/* Collection */}
          <p className="text-xs text-gray-500 dark:text-white/50 truncate" title={collectionName}>
            {truncateName(collectionName, 25)}
          </p>

          {/* Price & Buy Button Row */}
          {showPrice && price && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm font-mono text-gray-700 dark:text-white/80">{price}</span>
              {canBuy && onBuy && (
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    onBuy();
                  }}
                  className="cursor-pointer px-4 py-1.5 text-xs font-medium bg-terracotta text-white rounded-[32px]"
                  whileHover={{ scale: 1.05, y: -1 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  Buy
                </motion.button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Compact mode: show name on hover */}
      {compact && (
        <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover/nft:opacity-100 transition-opacity">
          <p className="text-xs text-white truncate">{truncateName(displayName, 15)}</p>
        </div>
      )}
    </motion.div>
  );
}
