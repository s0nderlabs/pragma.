/**
 * Name Resolution Utility - NAD + ENS Support
 *
 * Resolves human-readable names to addresses for transfers:
 * - NAD Name Service (.nad) - Monad native, PREFERRED
 * - ENS (.eth) - Ethereum mainnet, cross-chain compatible
 *
 * Priority: NAD > ENS > raw address
 */

import {
  type Address,
  type PublicClient,
  isAddress,
  getAddress,
  createPublicClient,
  http,
} from "viem";
import { mainnet } from "viem/chains";
import { normalize, namehash } from "viem/ens";

// NAD Name Service contract on Monad mainnet
const NNS_CONTRACT_ADDRESS =
  "0xCc7a1bfF8845573dbF0B3b96e25B9b549d4a2eC7" as const;

const NNS_ABI = [
  {
    name: "getResolvedAddress",
    type: "function",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "addr", type: "address" }],
    stateMutability: "view",
  },
  {
    name: "getPrimaryNameForAddress",
    type: "function",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "primaryName", type: "string" }],
    stateMutability: "view",
  },
] as const;

// Ethereum mainnet client for ENS resolution (lazy initialized)
let _ensClient: ReturnType<typeof createPublicClient> | null = null;

function getEnsClient() {
  if (!_ensClient) {
    _ensClient = createPublicClient({
      chain: mainnet,
      transport: http("https://eth.llamarpc.com"),
    });
  }
  return _ensClient;
}

export interface ResolvedName {
  address: Address;
  originalInput: string;
  nameType: "nad" | "ens" | "address";
}

export interface ResolvedNameDisplay {
  name: string;
  type: "nad" | "ens";
}

/**
 * Resolve a name (.nad, .eth) or 0x address to a checksummed address
 * Priority: NAD > ENS > raw address
 */
export async function resolveName(
  input: string,
  monadClient: PublicClient
): Promise<ResolvedName> {
  const trimmed = input.trim();

  // If already an address, just normalize
  if (trimmed.startsWith("0x") && isAddress(trimmed)) {
    return {
      address: getAddress(trimmed),
      originalInput: trimmed,
      nameType: "address",
    };
  }

  // Check for .nad domain (PREFERRED - Monad native)
  if (trimmed.toLowerCase().endsWith(".nad")) {
    const normalizedName = normalize(trimmed);
    const node = namehash(normalizedName);

    const resolvedAddress = await monadClient.readContract({
      address: NNS_CONTRACT_ADDRESS,
      abi: NNS_ABI,
      functionName: "getResolvedAddress",
      args: [node],
    });

    if (
      !resolvedAddress ||
      resolvedAddress === "0x0000000000000000000000000000000000000000"
    ) {
      throw new Error(`NAD name "${trimmed}" not found or not configured`);
    }

    return {
      address: getAddress(resolvedAddress),
      originalInput: trimmed,
      nameType: "nad",
    };
  }

  // Check for .eth domain (ENS - Ethereum mainnet)
  if (trimmed.toLowerCase().endsWith(".eth")) {
    const ensClient = getEnsClient();
    const resolvedAddress = await ensClient.getEnsAddress({
      name: normalize(trimmed),
    });

    if (!resolvedAddress) {
      throw new Error(`ENS name "${trimmed}" not found or not configured`);
    }

    return {
      address: getAddress(resolvedAddress),
      originalInput: trimmed,
      nameType: "ens",
    };
  }

  throw new Error(
    `Invalid format: "${trimmed}". Use 0x address, .nad name, or .eth name`
  );
}

/**
 * Get name for an address (reverse resolution)
 * Priority: NAD > ENS
 */
export async function getNameForAddress(
  address: Address,
  monadClient: PublicClient
): Promise<ResolvedNameDisplay | null> {
  // Try NAD first (preferred)
  try {
    const nadName = await monadClient.readContract({
      address: NNS_CONTRACT_ADDRESS,
      abi: NNS_ABI,
      functionName: "getPrimaryNameForAddress",
      args: [address],
    });

    if (nadName && nadName.length > 0) {
      return { name: `${nadName}.nad`, type: "nad" };
    }
  } catch {
    // NAD lookup failed, try ENS
  }

  // Try ENS as fallback
  try {
    const ensClient = getEnsClient();
    const ensName = await ensClient.getEnsName({ address });
    if (ensName) {
      return { name: ensName, type: "ens" };
    }
  } catch {
    // ENS lookup failed
  }

  return null;
}

/**
 * Format address with name for display
 * Returns: "name.nad (0x1234...5678)" or "0x1234...5678"
 */
export function formatAddressWithName(
  address: Address,
  resolvedName: ResolvedNameDisplay | null
): string {
  const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;
  if (resolvedName) {
    return `${resolvedName.name} (${shortAddr})`;
  }
  return shortAddr;
}
