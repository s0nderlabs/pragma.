/**
 * OpenSea Collection Resolution Helpers
 *
 * Utilities for resolving collection slugs to contract addresses and vice versa.
 * Enables endpoints to accept both formats for better agent compatibility.
 */

import { getAddress, type Address, isAddress } from "viem";

const OPENSEA_API_BASE_URL = "https://api.opensea.io/api/v2";
const OPENSEA_CHAIN = "monad";

// ============================================================================
// Types
// ============================================================================

export interface ResolvedCollection {
  slug: string;
  name: string;
  contractAddress: Address;
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Check if a string is a valid Ethereum address
 */
export function isContractAddress(identifier: string): boolean {
  return identifier.startsWith("0x") && identifier.length === 42 && isAddress(identifier);
}

/**
 * Check if a string looks like a collection slug (not a contract address)
 */
export function isCollectionSlug(identifier: string): boolean {
  return !isContractAddress(identifier);
}

// ============================================================================
// Resolution
// ============================================================================

/**
 * Resolve a collection slug to its contract address.
 * Uses OpenSea API to fetch collection info.
 *
 * @param slug - Collection slug (e.g., "skrumpeys")
 * @param apiKey - OpenSea API key
 * @returns Contract address and collection info, or null if not found
 */
export async function resolveSlugToContract(
  slug: string,
  apiKey: string
): Promise<ResolvedCollection | null> {
  try {
    const response = await fetch(`${OPENSEA_API_BASE_URL}/collections/${slug}`, {
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
      },
    });

    if (!response.ok) {
      console.error(`[resolveSlugToContract] Failed to fetch collection: ${slug}`, response.status);
      return null;
    }

    const data = await response.json();

    // Extract first contract address (Monad chain)
    const monadContract = data.contracts?.find(
      (c: { chain: string; address: string }) => c.chain === OPENSEA_CHAIN
    );

    if (!monadContract?.address) {
      console.error(`[resolveSlugToContract] No Monad contract found for: ${slug}`);
      return null;
    }

    return {
      slug: data.collection,
      name: data.name,
      contractAddress: getAddress(monadContract.address),
    };
  } catch (error) {
    console.error(`[resolveSlugToContract] Error resolving slug: ${slug}`, error);
    return null;
  }
}

/**
 * Resolve an identifier (slug or contract address) to a contract address.
 * If it's already a contract address, validates and returns it.
 * If it's a slug, resolves it via OpenSea API.
 *
 * @param identifier - Collection slug or contract address
 * @param apiKey - OpenSea API key (required if identifier is a slug)
 * @returns Contract address, or null if resolution fails
 */
export async function resolveToContractAddress(
  identifier: string,
  apiKey: string
): Promise<Address | null> {
  // Already a contract address - validate and return
  if (isContractAddress(identifier)) {
    try {
      return getAddress(identifier);
    } catch {
      return null;
    }
  }

  // It's a slug - resolve via OpenSea
  const resolved = await resolveSlugToContract(identifier, apiKey);
  return resolved?.contractAddress ?? null;
}
