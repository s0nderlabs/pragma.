/**
 * MON Price Helper
 *
 * Fetches MON/USD price from Monorail API for displaying NFT prices in USD.
 */

const MON_ADDRESS = "0x0000000000000000000000000000000000000000";

interface MonorailTokenResponse {
  address?: string;
  symbol?: string;
  usd_per_token?: string;  // Raw API response (snake_case)
  usdPerToken?: number;    // Processed AllowedToken (camelCase)
}

// Cache for MON price (5 minute TTL)
let cachedMonPrice: { price: number; timestamp: number } | undefined;
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch current MON/USD price from Monorail API.
 * Uses caching to avoid excessive API calls.
 */
export async function getMonUsdPrice(
  fetchFn: typeof fetch,
  origin: string
): Promise<number | undefined> {
  const now = Date.now();

  // Return cached price if still valid
  if (cachedMonPrice && now - cachedMonPrice.timestamp < PRICE_CACHE_TTL_MS) {
    return cachedMonPrice.price;
  }

  try {
    const response = await fetchFn(`${origin}/api/monorail/token?address=${MON_ADDRESS}`);
    if (!response.ok) {
      console.warn("[monPrice] Failed to fetch MON price:", response.status);
      return undefined;
    }

    const data = (await response.json()) as MonorailTokenResponse;

    // Handle both snake_case (raw API) and camelCase (AllowedToken)
    let price: number | undefined;
    if (typeof data.usdPerToken === "number" && data.usdPerToken > 0) {
      price = data.usdPerToken;
    } else if (data.usd_per_token) {
      price = parseFloat(data.usd_per_token);
    }

    if (!price || isNaN(price) || price <= 0) {
      return undefined;
    }

    // Cache the price
    cachedMonPrice = { price, timestamp: now };
    return price;
  } catch (error) {
    console.warn("[monPrice] Error fetching MON price:", error);
    return undefined;
  }
}

/**
 * Format a MON amount with optional USD equivalent.
 * Example: "9,000 MON (~$247)"
 */
export function formatMonWithUsd(
  monAmount: number,
  monUsdPrice: number | undefined,
  options: { compact?: boolean } = {}
): string {
  const { compact = false } = options;

  // Format MON amount
  const monFormatted = compact ? formatCompact(monAmount) : monAmount.toLocaleString();

  if (!monUsdPrice || monUsdPrice <= 0) {
    return `${monFormatted} MON`;
  }

  const usdValue = monAmount * monUsdPrice;
  const usdFormatted = formatUsd(usdValue);

  return `${monFormatted} MON (~${usdFormatted})`;
}

/**
 * Format number in compact form (1K, 1.5M, etc.)
 */
function formatCompact(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(2);
}

/**
 * Format USD value
 */
function formatUsd(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  if (value >= 1) {
    return `$${value.toFixed(0)}`;
  }
  return `$${value.toFixed(2)}`;
}
