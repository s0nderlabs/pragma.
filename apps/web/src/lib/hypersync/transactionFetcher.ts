/**
 * HyperSync Transaction Fetcher
 *
 * Fetches detailed transaction information for explaining transactions.
 * Decodes logs to understand what happened (swap, stake, transfer, etc.)
 *
 * Classification Strategy:
 * - Use RedeemedDelegation as PRIMARY indicator of Pragma transactions
 * - Classify by events in correct order (NFT > Stake > Monorail > 0x Swap > Wrap > etc.)
 * - For non-Pragma txs, decode function signature via OpenChain
 */

import {
  formatUnits,
  createPublicClient,
  http,
  defineChain,
  type Hex,
} from "viem";
import {
  decodeRedeemDelegations,
  type DecodedRedeemDelegation,
  type TxType,
  type DecodedCaveatParams,
  ENFORCERS,
} from "./decodeRedeemDelegations";

// ============================================================================
// Configuration
// ============================================================================

const MONAD_RPC_URL = process.env.MONAD_RPC_URL || "https://rpc.monad.xyz";
const MONORAIL_DATA_API_URL =
  process.env.NEXT_PUBLIC_MONORAIL_DATA_API_URL || "https://api.monorail.xyz/v2";
const OPENCHAIN_API = "https://api.openchain.xyz/signature-database/v1/lookup";
const OPENSEA_API_URL = "https://api.opensea.io/api/v2";
const OPENSEA_CHAIN = "monad";

// Monad Mainnet chain definition
const monadMainnet = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [MONAD_RPC_URL] } },
});

// Create viem client for RPC calls
const publicClient = createPublicClient({
  chain: monadMainnet,
  transport: http(MONAD_RPC_URL),
});

// Known contracts
const CONTRACTS = {
  DELEGATION_MANAGER: "0xdb9b1e94b5b69df7e401ddbede43491141047db3",
  PRAGMA_FEE_ENFORCER: "0xc0060a7411b5a66fff4285bef32e02ecd1ba9d92",
  MONORAIL_ROUTER: "0xa68a7f0601effdc65c64d9c47ca1b18d96b4352c",
  APRIORI: "0x0c65a0bc65a5d819235b71f554d210d3f80e0852",
  WMON: "0x3bd359c1119da7da1d913d1c4d2b7c461115433a",
  SEAPORT: "0x0000000000000068f116a894984e2db1123eb395",
  ENTRYPOINT_V07: "0x0000000071727de22e5e9d8baf0edac6f37da032",
} as const;

// Function selectors
const SELECTORS = {
  HANDLE_OPS: "0x765e827f", // handleOps(PackedUserOperation[],address)
  EXECUTE: "0x5c1c6dcd", // execute((address,uint256,bytes))
  EXECUTE_BATCH: "0x34fcd5be", // executeBatch((address,uint256,bytes)[])
  TRANSFER: "0xa9059cbb", // transfer(address,uint256)
} as const;

// Event topic signatures
const TOPICS = {
  REDEEMED_DELEGATION:
    "0x40dadaa36c6c2e3d7317e24757451ffb2d603d875f0ad5e92c5dd156573b1873",
  TRANSFER:
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  DEPOSIT_APRIORI:
    "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7",
  // ERC-7540: RedeemRequest(address,address,uint256,address,uint256,uint256)
  REDEEM_REQUEST:
    "0x110990b6c317a85848c161e269666a01fea23eb9e16150c2c46cae8c0faf4a9d",
  // ERC-7540: Redeem(address,address,uint256,uint256,uint256,uint256) - claim unstaked funds
  REDEEM_CLAIM:
    "0x8caf04742286d017f9ac3924388e188c73e6e5094311c5e59a61a7ef86dda8bf",
  WMON_DEPOSIT:
    "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c",
  WMON_WITHDRAWAL:
    "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65",
  APPROVAL:
    "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
  ORDER_FULFILLED:
    "0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31",
  VALIDATED_PAYMENT:
    "0x7f4091b46c33e918a0f3aa42307641d17bb67029427a5369e54b3539773057df",
  INCREASED_SPENT_MAP:
    "0xc026e493323d526061a052b5dd562495120e2f648797a48be61966d3a6beec8d",
  // MonorailSwap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, ...)
  MONORAIL_SWAP:
    "0x6e4c3aa29fc5ed6dc56aa0a95d8ac6660b6bf4e9c2ab49a0ea79b9cdafbcd7eb",
} as const;

// Known token decimals (fallback)
const KNOWN_TOKEN_DECIMALS: Record<string, number> = {
  "0x0000000000000000000000000000000000000000": 18, // Native MON
  "0x3bd359c1119da7da1d913d1c4d2b7c461115433a": 18, // WMON
  "0xe7cd86e13ac4309349f30b3435a9d337750fc82d": 6, // USDT0
  "0x00000000efe302beaa2b3e6e1b18d08d69a9012a": 6, // AUSD
  "0xf817257fed379853cde0fa4f97ab987181b1e5ea": 6, // USDC
  "0x0f0bdebf0f83cd1ee3974779bcb7315f9808c714": 6, // USDC (alternate bridge)
  "0x754704bc059f8c67012fed69bc8a327a5aafb603": 6, // USDC (0x bridge)
  "0xee8c0e9f1bffb4eb878d8f15f368a02a35481242": 18, // WETH
  "0xb5a30b0fdc5ea94a52fdc42e3e9760cb8449fb37": 18, // aprMON
};

// ============================================================================
// Types
// ============================================================================

interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  priceUsd: number;
}

interface DecodedEvent {
  name: string;
  contract: string;
  contractName?: string;
  protocol?: string;
  topic0: string;
  params: Record<string, string | bigint | boolean>;
}

/**
 * Delegation info decoded from redeemDelegations calldata
 */
export interface DelegationInfo {
  /** Smart account address that granted the delegation */
  delegator: string;
  /** Session key address that executed the transaction */
  delegate: string;
  /** What action was authorized (from decoded execution) */
  actionType: TxType;
  /** Execution target contract */
  executionTarget: string;
  /** Execution target contract name (if known) */
  executionTargetName: string | null;
  /** Value sent with execution (in MON) */
  executionValue: string;
  /** Caveats (enforcers) that restricted this delegation */
  caveats: Array<{
    enforcerName: string;
    enforcerAddress: string;
    /** Decoded human-readable parameters for this enforcer */
    decodedParams: DecodedCaveatParams;
  }>;
}

export interface TransactionExplanation {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  status: "success" | "failed";
  type: string;
  typeDescription: string;
  summary: string;

  // Transaction metadata
  nonce: number;
  transactionIndex: number;
  inputDataSize: number;
  valueTransferred: string; // formatted MON

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
    // NFT-specific fields (optional)
    collection?: string;
    tokenId?: string;
    nftName?: string;
    imageUrl?: string;
  };
  protocol?: string;
  route?: string[];
  pragmaFee?: {
    amount: string;
    amountFormatted: string;
    percentage: string;
  };
  // Gas info (Monad charges gasLimit, not gasUsed!)
  gasFee: {
    amount: string;
    amountFormatted: string;
    gasUsed: string;
    gasLimit: string;
    gasPrice: string;
    gasPriceGwei: string;
  };
  from: string;
  to: string;
  counterparty?: string;
  events: DecodedEvent[];
  /** Delegation info (only for redeemDelegations transactions) */
  delegation?: DelegationInfo;
  /** UserOp details (only for ERC-4337 handleOps transactions) */
  userOp?: {
    sender: string; // Smart account
    innerTarget: string; // Actual execution target
    innerValue: string; // Actual value transferred
    innerCallData: string; // Actual calldata
    innerSelector: string; // Inner function selector
    innerFunctionName: string; // Decoded function name
  };
}

// ============================================================================
// Token Info Cache
// ============================================================================

const tokenCache = new Map<string, TokenInfo>();

async function getTokenInfo(address: string): Promise<TokenInfo> {
  const normalized = address.toLowerCase();
  const cached = tokenCache.get(normalized);

  if (cached) {
    return cached;
  }

  try {
    const queryAddress =
      normalized === "0x0000000000000000000000000000000000000000"
        ? "0x3bd359c1119da7da1d913d1c4d2b7c461115433a"
        : normalized;

    const response = await fetch(`${MONORAIL_DATA_API_URL}/token/${queryAddress}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const info: TokenInfo = {
      address: normalized,
      symbol:
        normalized === "0x0000000000000000000000000000000000000000"
          ? "MON"
          : data.symbol || "UNKNOWN",
      decimals: data.decimals ?? KNOWN_TOKEN_DECIMALS[normalized] ?? 18,
      priceUsd: data.usd_per_token || 0,
    };

    tokenCache.set(normalized, info);
    return info;
  } catch {
    return {
      address: normalized,
      symbol: "UNKNOWN",
      decimals: KNOWN_TOKEN_DECIMALS[normalized] ?? 18,
      priceUsd: 0,
    };
  }
}

/**
 * Prefetch multiple tokens in parallel to warm cache.
 * This prevents sequential API calls from slowing down transaction analysis.
 */
async function prefetchTokenInfo(addresses: string[]): Promise<void> {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const uncached = unique.filter((a) => !tokenCache.has(a));
  if (uncached.length === 0) return;

  await Promise.all(uncached.map((addr) => getTokenInfo(addr)));
}

/**
 * Extract all token addresses from transaction logs for prefetching.
 * Looks for ERC20 Transfer events.
 */
function extractTokenAddressesFromLogs(
  logs: Array<{ address: string; topics: string[] }>
): string[] {
  const TRANSFER_TOPIC =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const addresses: string[] = [];

  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() === TRANSFER_TOPIC.toLowerCase()) {
      addresses.push(log.address);
    }
  }

  return addresses;
}

// ============================================================================
// OpenSea NFT Metadata Fetcher
// ============================================================================

interface NFTMetadata {
  name?: string;
  collection?: string;
  imageUrl?: string;
}

/**
 * Fetch NFT metadata from OpenSea API
 * Returns null on error (graceful degradation)
 */
async function fetchNFTMetadata(
  contractAddress: string,
  tokenId: string
): Promise<NFTMetadata | null> {
  const apiKey = process.env.OPENSEA_API_KEY;
  if (!apiKey) {
    console.warn("[fetchNFTMetadata] OPENSEA_API_KEY not configured");
    return null;
  }

  try {
    const url = `${OPENSEA_API_URL}/chain/${OPENSEA_CHAIN}/contract/${contractAddress}/nfts/${tokenId}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
      },
    });

    if (!response.ok) {
      console.warn(
        `[fetchNFTMetadata] OpenSea API error: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data = await response.json();
    const nft = data?.nft;

    if (!nft) {
      return null;
    }

    return {
      name: nft.name || `#${tokenId}`,
      collection: nft.collection,
      imageUrl: nft.display_image_url || nft.image_url,
    };
  } catch (error) {
    console.warn("[fetchNFTMetadata] Error:", error);
    return null;
  }
}

// ============================================================================
// OpenChain Signature Decoder
// ============================================================================

async function decodeSelector(selector: string): Promise<string | null> {
  try {
    const response = await fetch(`${OPENCHAIN_API}?function=${selector}`);
    const data = await response.json();
    if (data.ok && data.result?.function?.[selector]?.length > 0) {
      return data.result.function[selector][0].name;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// ============================================================================
// Event Decoding
// ============================================================================

function decodeEvents(
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
    blockNumber: bigint;
    transactionHash: string;
    logIndex: number;
  }>
): DecodedEvent[] {
  const events: DecodedEvent[] = [];

  for (const log of logs) {
    const topic0 = log.topics[0]?.toLowerCase() || "";
    const contractAddr = log.address.toLowerCase();

    // Determine contract name
    let contractName: string | undefined;
    let protocol: string | undefined;

    if (contractAddr === CONTRACTS.DELEGATION_MANAGER) {
      contractName = "DelegationMgr";
      protocol = "Pragma";
    } else if (contractAddr === CONTRACTS.PRAGMA_FEE_ENFORCER) {
      contractName = "PragmaFee";
      protocol = "Pragma";
    } else if (contractAddr === CONTRACTS.MONORAIL_ROUTER) {
      contractName = "Monorail";
      protocol = "Monorail";
    } else if (contractAddr === CONTRACTS.APRIORI) {
      contractName = "aPriori";
      protocol = "aPriori";
    } else if (contractAddr === CONTRACTS.WMON) {
      contractName = "WMON";
      protocol = "WMON";
    } else if (contractAddr === CONTRACTS.SEAPORT) {
      contractName = "Seaport";
      protocol = "OpenSea";
    }

    const event: DecodedEvent = {
      name: getEventName(topic0),
      contract: contractAddr,
      contractName,
      protocol,
      topic0,
      params: {},
    };

    // Decode params based on event type
    if (topic0 === TOPICS.TRANSFER.toLowerCase()) {
      event.params = {
        from: "0x" + (log.topics[1]?.slice(26) || ""),
        to: "0x" + (log.topics[2]?.slice(26) || ""),
        amount: log.data && log.data.length > 2 ? BigInt(log.data) : 0n,
      };
    } else if (topic0 === TOPICS.DEPOSIT_APRIORI.toLowerCase()) {
      if (log.data && log.data.length >= 130) {
        const data = log.data.slice(2);
        event.params = {
          sender: "0x" + (log.topics[1]?.slice(26) || ""),
          owner: "0x" + (log.topics[2]?.slice(26) || ""),
          assets: BigInt("0x" + data.slice(0, 64)),
          shares: BigInt("0x" + data.slice(64, 128)),
        };
      }
    } else if (topic0 === TOPICS.WMON_DEPOSIT.toLowerCase()) {
      event.params = {
        dst: "0x" + (log.topics[1]?.slice(26) || ""),
        wad: log.data && log.data.length > 2 ? BigInt(log.data) : 0n,
      };
    } else if (topic0 === TOPICS.WMON_WITHDRAWAL.toLowerCase()) {
      event.params = {
        src: "0x" + (log.topics[1]?.slice(26) || ""),
        wad: log.data && log.data.length > 2 ? BigInt(log.data) : 0n,
      };
    } else if (topic0 === TOPICS.VALIDATED_PAYMENT.toLowerCase()) {
      const dataStr = log.data?.startsWith("0x") ? log.data.slice(2) : log.data || "";
      const chunks: string[] = [];
      for (let i = 0; i < dataStr.length; i += 64) {
        chunks.push(dataStr.slice(i, i + 64));
      }
      if (chunks.length >= 7) {
        const safeBigInt = (hex: string) => {
          const cleaned = hex.replace(/^0+/, "") || "0";
          return BigInt("0x" + cleaned);
        };
        event.params = {
          token: "0x" + chunks[0].slice(24),
          delegator: "0x" + chunks[1].slice(24),
          redeemer: "0x" + chunks[2].slice(24),
          expectedAmount: safeBigInt(chunks[3]),
          actualAmount: safeBigInt(chunks[4]),
        };
      }
    }

    events.push(event);
  }

  return events;
}

function getEventName(topic0: string): string {
  const t = topic0.toLowerCase();
  if (t === TOPICS.REDEEMED_DELEGATION.toLowerCase()) return "RedeemedDelegation";
  if (t === TOPICS.TRANSFER.toLowerCase()) return "Transfer";
  if (t === TOPICS.DEPOSIT_APRIORI.toLowerCase()) return "Deposit";
  if (t === TOPICS.REDEEM_REQUEST.toLowerCase()) return "RedeemRequest";
  if (t === TOPICS.REDEEM_CLAIM.toLowerCase()) return "Redeem";
  if (t === TOPICS.WMON_DEPOSIT.toLowerCase()) return "Deposit";
  if (t === TOPICS.WMON_WITHDRAWAL.toLowerCase()) return "Withdrawal";
  if (t === TOPICS.APPROVAL.toLowerCase()) return "Approval";
  if (t === TOPICS.ORDER_FULFILLED.toLowerCase()) return "OrderFulfilled";
  if (t === TOPICS.VALIDATED_PAYMENT.toLowerCase()) return "ValidatedPayment";
  if (t === TOPICS.INCREASED_SPENT_MAP.toLowerCase()) return "IncreasedSpentMap";
  return "Unknown";
}

// ============================================================================
// UserOp Decoding (ERC-4337)
// ============================================================================

interface UserOpDetails {
  sender: string; // Smart account
  innerTarget: string; // Actual execution target
  innerValue: string; // Actual value transferred (formatted MON)
  innerCallData: string; // Actual calldata
  innerSelector: string; // Inner function selector
  innerFunctionName: string; // Decoded function name
}

/**
 * Decode a handleOps transaction to extract the inner UserOperation details.
 *
 * PackedUserOperation struct (ERC-4337 v0.7):
 * - sender (address): smart account
 * - nonce (uint256)
 * - initCode (bytes): empty if account exists
 * - callData (bytes): the actual operation - usually execute() or executeBatch()
 * - accountGasLimits (bytes32)
 * - preVerificationGas (uint256)
 * - gasFees (bytes32)
 * - paymasterAndData (bytes)
 * - signature (bytes)
 */
function decodeUserOp(input: string): UserOpDetails | null {
  // Check if this is handleOps
  if (!input.toLowerCase().startsWith(SELECTORS.HANDLE_OPS.toLowerCase())) {
    return null;
  }

  try {
    const hex = input.slice(10); // Remove function selector

    // handleOps(PackedUserOperation[] calldata ops, address payable beneficiary)
    // First 32 bytes: offset to ops array
    // Second 32 bytes: beneficiary address
    // Then: ops array data

    // Skip to array length (at offset 64 bytes = 128 hex chars)
    const arrayLengthHex = hex.slice(128, 192);
    const arrayLength = Number(BigInt("0x" + arrayLengthHex));

    if (arrayLength === 0) {
      return null;
    }

    // First UserOp starts after array length
    // sender is the first 32 bytes of each PackedUserOperation
    const userOpStart = 192; // After [offset, beneficiary, arrayLength]
    const senderHex = hex.slice(userOpStart, userOpStart + 64);
    const sender = "0x" + senderHex.slice(24); // Last 20 bytes = address

    // Find callData by looking for the execute/executeBatch selector pattern
    // The callData is a dynamic bytes field, so we need to find it by selector
    const hexLower = hex.toLowerCase();

    // Search for execute((address,uint256,bytes)) selector: 0x5c1c6dcd
    const executeSelector = SELECTORS.EXECUTE.slice(2).toLowerCase();
    const executeBatchSelector = SELECTORS.EXECUTE_BATCH.slice(2).toLowerCase();

    let innerSelector = "";
    let innerFunctionName = "unknown";
    let innerTarget = "";
    let innerValue = "0";
    let innerCallData = "0x";

    // Find execute selector in the hex
    let execIdx = hexLower.indexOf(executeSelector);
    if (execIdx === -1) {
      execIdx = hexLower.indexOf(executeBatchSelector);
      if (execIdx !== -1) {
        innerSelector = SELECTORS.EXECUTE_BATCH;
        innerFunctionName = "executeBatch";
      }
    } else {
      innerSelector = SELECTORS.EXECUTE;
      innerFunctionName = "execute";
    }

    if (execIdx !== -1 && innerSelector === SELECTORS.EXECUTE) {
      // execute((address,uint256,bytes)) - decode the tuple
      // After selector (8 chars), we have ABI-encoded (address,uint256,bytes)

      // Offset to tuple is 32 bytes after selector
      const tupleStart = execIdx + 8 + 64; // Skip selector + offset pointer

      // address (20 bytes, right-padded to 32)
      const targetHex = hex.slice(tupleStart, tupleStart + 64);
      innerTarget = "0x" + targetHex.slice(24);

      // uint256 value
      const valueHex = hex.slice(tupleStart + 64, tupleStart + 128);
      const valueWei = BigInt("0x" + valueHex);
      innerValue = formatUnits(valueWei, 18);

      // bytes calldata - offset then data
      const callDataOffsetHex = hex.slice(tupleStart + 128, tupleStart + 192);
      const callDataOffset = Number(BigInt("0x" + callDataOffsetHex));

      // Jump to callData location (relative to tuple start)
      const callDataLenStart = tupleStart + callDataOffset * 2;
      const callDataLenHex = hex.slice(callDataLenStart, callDataLenStart + 64);
      const callDataLen = Number(BigInt("0x" + callDataLenHex));

      if (callDataLen > 0) {
        innerCallData =
          "0x" + hex.slice(callDataLenStart + 64, callDataLenStart + 64 + callDataLen * 2);
      } else {
        innerCallData = "0x"; // Empty calldata = native transfer
      }
    }

    return {
      sender: sender.toLowerCase(),
      innerTarget: innerTarget.toLowerCase(),
      innerValue,
      innerCallData,
      innerSelector,
      innerFunctionName,
    };
  } catch {
    return null;
  }
}

/**
 * Classify a UserOp based on its inner operation
 */
function classifyUserOp(userOp: UserOpDetails): {
  type: string;
  typeDescription: string;
  summary: string;
} {
  const shortSender = `${userOp.sender.slice(0, 6)}...${userOp.sender.slice(-4)}`;
  const shortTarget = userOp.innerTarget
    ? `${userOp.innerTarget.slice(0, 6)}...${userOp.innerTarget.slice(-4)}`
    : "unknown";

  // Check known targets
  const targetLower = userOp.innerTarget.toLowerCase();

  // Session key funding: execute with value > 0 and empty calldata
  if (
    userOp.innerSelector === SELECTORS.EXECUTE &&
    parseFloat(userOp.innerValue) > 0 &&
    userOp.innerCallData === "0x"
  ) {
    return {
      type: "session_key_funding",
      typeDescription: "Session Key Funding",
      summary: `Smart Account ${shortSender} funded session key ${shortTarget} with ${userOp.innerValue} MON`,
    };
  }

  // Delegation registration: target is DelegationManager
  if (targetLower === CONTRACTS.DELEGATION_MANAGER) {
    return {
      type: "delegation_registration",
      typeDescription: "Delegation Registration",
      summary: `Smart Account ${shortSender} registered a delegation on DelegationManager`,
    };
  }

  // Token transfer: inner calldata starts with transfer selector
  if (userOp.innerCallData.startsWith(SELECTORS.TRANSFER)) {
    return {
      type: "token_transfer",
      typeDescription: "Token Transfer (UserOp)",
      summary: `Smart Account ${shortSender} transferred tokens via UserOp`,
    };
  }

  // Default: generic UserOp
  return {
    type: "user_operation",
    typeDescription: "UserOperation",
    summary: `Smart Account ${shortSender} executed ${userOp.innerFunctionName}() on ${shortTarget}`,
  };
}

// ============================================================================
// Transaction Explanation
// ============================================================================

export async function explainTransaction(
  txHash: Hex
): Promise<TransactionExplanation> {
  // Fetch transaction, receipt, and block
  const [tx, txReceipt] = await Promise.all([
    publicClient.getTransaction({ hash: txHash }).catch(() => null),
    publicClient.getTransactionReceipt({ hash: txHash }).catch(() => null),
  ]);

  if (!tx) {
    throw new Error(`Transaction not found: ${txHash}`);
  }

  // Fetch block for timestamp
  const blockData = await publicClient
    .getBlock({ blockNumber: tx.blockNumber! })
    .catch(() => null);

  const timestamp = blockData ? Number(blockData.timestamp) : 0;
  const logs = txReceipt?.logs || [];
  const selector = tx.input?.slice(0, 10);
  const decodedSelector = await decodeSelector(selector || "");

  // Decode events
  const events = decodeEvents(logs);

  // Prefetch all token info in parallel to warm cache before analysis
  // This prevents sequential API calls from slowing down extractSwapDetails()
  const tokenAddresses = extractTokenAddressesFromLogs(logs);
  if (tokenAddresses.length > 0) {
    await prefetchTokenInfo(tokenAddresses);
  }

  // =========================================================================
  // Classification Logic (based on validated test script)
  // =========================================================================

  let type = "unknown";
  let typeDescription = "Unknown Transaction";
  let summary = "Transaction executed";
  let protocol: string | undefined;
  let tokenIn: TransactionExplanation["tokenIn"];
  let tokenOut: TransactionExplanation["tokenOut"];
  let pragmaFee: TransactionExplanation["pragmaFee"];
  let counterparty: string | undefined;
  const route: string[] = [];
  let userOpDetails: UserOpDetails | null = null;

  // Check for RedeemedDelegation event (PRIMARY indicator of Pragma tx)
  const hasRedeemedDelegation = logs.some(
    (l) =>
      l.topics[0]?.toLowerCase() === TOPICS.REDEEMED_DELEGATION.toLowerCase() &&
      l.address.toLowerCase() === CONTRACTS.DELEGATION_MANAGER
  );

  // Check for UserOp (ERC-4337 handleOps on EntryPoint)
  const isUserOp =
    tx.to?.toLowerCase() === CONTRACTS.ENTRYPOINT_V07 &&
    selector?.toLowerCase() === SELECTORS.HANDLE_OPS.toLowerCase();

  if (isUserOp && tx.input) {
    // Decode the UserOp to understand what the smart account is actually doing
    userOpDetails = decodeUserOp(tx.input);

    if (userOpDetails) {
      const classification = classifyUserOp(userOpDetails);
      type = classification.type;
      typeDescription = classification.typeDescription;
      summary = classification.summary;
      protocol = "ERC-4337";

      // For session key funding, set tokenIn as the MON being transferred
      if (type === "session_key_funding" && parseFloat(userOpDetails.innerValue) > 0) {
        tokenIn = {
          address: "0x0000000000000000000000000000000000000000",
          symbol: "MON",
          amount: (parseFloat(userOpDetails.innerValue) * 1e18).toString(),
          amountFormatted: userOpDetails.innerValue,
        };
        counterparty = userOpDetails.innerTarget;
      }
    }
  } else if (!hasRedeemedDelegation) {
    // Non-Pragma transaction - provide detailed analysis
    const funcName = decodedSelector ? decodedSelector.split("(")[0] : "unknown";
    const funcSignature = decodedSelector || selector || "unknown";

    // Get contract name if known
    const targetContract = tx.to?.toLowerCase() || "";
    const contractNames: Record<string, string> = {
      [CONTRACTS.DELEGATION_MANAGER]: "DelegationManager",
      [CONTRACTS.MONORAIL_ROUTER]: "Monorail Router",
      [CONTRACTS.APRIORI]: "aPriori Vault",
      [CONTRACTS.WMON]: "WMON Token",
      [CONTRACTS.SEAPORT]: "OpenSea Seaport",
      "0x6131b5fae19ea4f9d964eac0408e4408b66337b5": "Uniswap Router",
    };
    const contractName = contractNames[targetContract] || null;

    type = funcName.toLowerCase();
    typeDescription = funcName;

    // Build detailed summary for non-Pragma tx
    const shortFrom = `${tx.from.slice(0, 6)}...${tx.from.slice(-4)}`;
    const shortTo = tx.to ? `${tx.to.slice(0, 6)}...${tx.to.slice(-4)}` : "Contract Creation";

    if (contractName) {
      summary = `${shortFrom} called ${funcName}() on ${contractName}`;
    } else {
      summary = `${shortFrom} called ${funcName}() on ${shortTo}`;
    }

    // Try to extract token movements from events even for non-Pragma txs
    const transferEvents = events.filter((e) => e.name === "Transfer");
    if (transferEvents.length > 0) {
      // Find tokens sent by tx.from
      const outgoingTransfer = transferEvents.find(
        (e) => (e.params.from as string)?.toLowerCase() === tx.from.toLowerCase()
      );
      const incomingTransfer = transferEvents.find(
        (e) => (e.params.to as string)?.toLowerCase() === tx.from.toLowerCase()
      );

      if (outgoingTransfer) {
        const amount = outgoingTransfer.params.amount as bigint;
        const tokenInfo = await getTokenInfo(outgoingTransfer.contract);
        const amountFormatted = formatUnits(amount, tokenInfo.decimals);
        tokenOut = {
          address: outgoingTransfer.contract,
          symbol: tokenInfo.symbol,
          amount: amount.toString(),
          amountFormatted,
          valueUsd:
            tokenInfo.priceUsd > 0
              ? (parseFloat(amountFormatted) * tokenInfo.priceUsd).toFixed(2)
              : undefined,
        };
      }

      if (incomingTransfer) {
        const amount = incomingTransfer.params.amount as bigint;
        const tokenInfo = await getTokenInfo(incomingTransfer.contract);
        const amountFormatted = formatUnits(amount, tokenInfo.decimals);
        tokenIn = {
          address: incomingTransfer.contract,
          symbol: tokenInfo.symbol,
          amount: amount.toString(),
          amountFormatted,
          valueUsd:
            tokenInfo.priceUsd > 0
              ? (parseFloat(amountFormatted) * tokenInfo.priceUsd).toFixed(2)
              : undefined,
        };
      }
    }
  } else {
    // =========================================================================
    // PRAGMA TRANSACTION - Classify by events (ORDER MATTERS!)
    // =========================================================================

    // 1. NFT Detection (check FIRST before other transaction types)
    const hasOrderFulfilled = logs.some(
      (l) =>
        l.topics[0]?.toLowerCase() === TOPICS.ORDER_FULFILLED.toLowerCase() &&
        l.address.toLowerCase() === CONTRACTS.SEAPORT
    );
    const hasERC721Transfer = logs.some(
      (l) =>
        l.topics[0]?.toLowerCase() === TOPICS.TRANSFER.toLowerCase() &&
        l.topics.length === 4 // ERC721: [sig, from, to, tokenId]
    );

    // 1a. NFT Purchase (OrderFulfilled from Seaport = marketplace purchase)
    if (hasOrderFulfilled) {
      type = "nft_purchase";
      typeDescription = "NFT Purchase";
      protocol = "Seaport";

      // Extract NFT details from ERC721 Transfer event
      // ERC721 Transfer: topics = [sig, from, to, tokenId]
      const erc721TransferLog = logs.find(
        (l) =>
          l.topics[0]?.toLowerCase() === TOPICS.TRANSFER.toLowerCase() &&
          l.topics.length === 4
      );

      let nftContract = "";
      let nftTokenId = "";
      let nftMetadata: NFTMetadata | null = null;

      if (erc721TransferLog && erc721TransferLog.topics[3]) {
        nftContract = erc721TransferLog.address.toLowerCase();
        // tokenId is in topics[3] (padded to 32 bytes)
        nftTokenId = BigInt(erc721TransferLog.topics[3]).toString();

        // Fetch NFT metadata from OpenSea (graceful degradation on error)
        nftMetadata = await fetchNFTMetadata(nftContract, nftTokenId);
      }

      // Get payment info from ValidatedPayment if available
      const vpEvent = events.find((e) => e.name === "ValidatedPayment");
      if (vpEvent && vpEvent.params.actualAmount) {
        const actualAmount = vpEvent.params.actualAmount as bigint;
        const feeToken = (vpEvent.params.token as string) || "";
        const tokenInfo = await getTokenInfo(feeToken);
        const amountFormatted = formatUnits(actualAmount, tokenInfo.decimals);

        tokenIn = {
          address: feeToken,
          symbol: tokenInfo.symbol,
          amount: actualAmount.toString(),
          amountFormatted,
          valueUsd:
            tokenInfo.priceUsd > 0
              ? (parseFloat(amountFormatted) * tokenInfo.priceUsd).toFixed(2)
              : undefined,
        };

        // Build tokenOut with NFT metadata
        const nftName = nftMetadata?.name || (nftTokenId ? `#${nftTokenId}` : "NFT");
        tokenOut = {
          address: nftContract || CONTRACTS.SEAPORT,
          symbol: nftName,
          amount: "1",
          amountFormatted: "1",
          // NFT-specific fields
          collection: nftMetadata?.collection,
          tokenId: nftTokenId || undefined,
          nftName: nftMetadata?.name,
          imageUrl: nftMetadata?.imageUrl,
        };

        // Build summary with NFT details
        if (nftMetadata?.name && nftMetadata?.collection) {
          summary = `Purchased ${nftMetadata.name} from ${nftMetadata.collection} for ${amountFormatted} ${tokenInfo.symbol}`;
        } else if (nftTokenId) {
          summary = `Purchased NFT #${nftTokenId} for ${amountFormatted} ${tokenInfo.symbol}`;
        } else {
          summary = `Purchased NFT for ${amountFormatted} ${tokenInfo.symbol}`;
        }
      } else {
        // No ValidatedPayment - still try to show NFT details
        const nftName = nftMetadata?.name || (nftTokenId ? `#${nftTokenId}` : "NFT");
        tokenOut = {
          address: nftContract || CONTRACTS.SEAPORT,
          symbol: nftName,
          amount: "1",
          amountFormatted: "1",
          collection: nftMetadata?.collection,
          tokenId: nftTokenId || undefined,
          nftName: nftMetadata?.name,
          imageUrl: nftMetadata?.imageUrl,
        };

        if (nftMetadata?.name && nftMetadata?.collection) {
          summary = `Purchased ${nftMetadata.name} from ${nftMetadata.collection}`;
        } else if (nftTokenId) {
          summary = `Purchased NFT #${nftTokenId}`;
        } else {
          summary = "Purchased NFT";
        }
      }
    }
    // 1b. NFT Transfer (ERC721 transfer WITHOUT OrderFulfilled = p2p transfer)
    else if (hasERC721Transfer && !hasOrderFulfilled) {
      type = "nft_transfer";
      typeDescription = "NFT Transfer";
      protocol = "ERC721";

      // Extract NFT details from ERC721 Transfer event
      const erc721TransferLog = logs.find(
        (l) =>
          l.topics[0]?.toLowerCase() === TOPICS.TRANSFER.toLowerCase() &&
          l.topics.length === 4
      );

      let nftContract = "";
      let nftTokenId = "";
      let nftMetadata: NFTMetadata | null = null;
      let recipientAddr = "";

      if (erc721TransferLog && erc721TransferLog.topics[3]) {
        nftContract = erc721TransferLog.address.toLowerCase();
        nftTokenId = BigInt(erc721TransferLog.topics[3]).toString();
        recipientAddr = ("0x" + erc721TransferLog.topics[2]?.slice(26)).toLowerCase();

        // Fetch NFT metadata from OpenSea (graceful degradation on error)
        nftMetadata = await fetchNFTMetadata(nftContract, nftTokenId);
      }

      const nftName = nftMetadata?.name || (nftTokenId ? `#${nftTokenId}` : "NFT");
      tokenOut = {
        address: nftContract,
        symbol: nftName,
        amount: "1",
        amountFormatted: "1",
        collection: nftMetadata?.collection,
        tokenId: nftTokenId || undefined,
        nftName: nftMetadata?.name,
        imageUrl: nftMetadata?.imageUrl,
      };
      counterparty = recipientAddr;

      // Format recipient for summary (short address)
      const recipientShort = recipientAddr ? `${recipientAddr.slice(0, 6)}...${recipientAddr.slice(-4)}` : "";

      if (nftMetadata?.name && nftMetadata?.collection) {
        summary = recipientShort
          ? `Transferred ${nftMetadata.name} from ${nftMetadata.collection} to ${recipientShort}`
          : `Transferred ${nftMetadata.name} from ${nftMetadata.collection}`;
      } else if (nftTokenId) {
        summary = recipientShort
          ? `Transferred NFT #${nftTokenId} to ${recipientShort}`
          : `Transferred NFT #${nftTokenId}`;
      } else {
        summary = recipientShort ? `Transferred NFT to ${recipientShort}` : "Transferred NFT";
      }
    }
    // 2. Stake (aPriori Deposit)
    else if (
      logs.some(
        (l) =>
          l.topics[0]?.toLowerCase() === TOPICS.DEPOSIT_APRIORI.toLowerCase() &&
          l.address.toLowerCase() === CONTRACTS.APRIORI
      )
    ) {
      type = "stake";
      typeDescription = "Liquid Staking";
      protocol = "aPriori";

      const depositEvent = events.find(
        (e) => e.name === "Deposit" && e.contract === CONTRACTS.APRIORI
      );
      if (depositEvent) {
        const assets = depositEvent.params.assets as bigint;
        const shares = depositEvent.params.shares as bigint;
        const monInfo = await getTokenInfo(CONTRACTS.WMON);

        const assetsFormatted = formatUnits(assets, 18);
        const sharesFormatted = formatUnits(shares, 18);

        tokenIn = {
          address: "0x0000000000000000000000000000000000000000",
          symbol: "MON",
          amount: assets.toString(),
          amountFormatted: assetsFormatted,
          valueUsd:
            monInfo.priceUsd > 0
              ? (parseFloat(assetsFormatted) * monInfo.priceUsd).toFixed(2)
              : undefined,
        };

        tokenOut = {
          address: "0xb5a30b0fdc5ea94a52fdc42e3e9760cb8449fb37",
          symbol: "aprMON",
          amount: shares.toString(),
          amountFormatted: sharesFormatted,
        };

        summary = `Staked ${assetsFormatted} MON for ${sharesFormatted} aprMON`;
      }
    }
    // 3. Unstake Request (aPriori RedeemRequest)
    else if (
      logs.some(
        (l) =>
          l.topics[0]?.toLowerCase() === TOPICS.REDEEM_REQUEST.toLowerCase() &&
          l.address.toLowerCase() === CONTRACTS.APRIORI
      )
    ) {
      type = "unstake_request";
      typeDescription = "Unstake Request";
      protocol = "aPriori";

      // Find aprMON transfer TO aPriori to get amount being unstaked
      const aprMonAddress = "0xb5a30b0fdc5ea94a52fdc42e3e9760cb8449fb37";
      const aprTransfer = logs.find(
        (l) =>
          l.topics[0]?.toLowerCase() === TOPICS.TRANSFER.toLowerCase() &&
          l.address.toLowerCase() === aprMonAddress &&
          l.topics[2] && // to address
          ("0x" + l.topics[2].slice(26)).toLowerCase() === CONTRACTS.APRIORI
      );

      if (aprTransfer && aprTransfer.data) {
        const amount = BigInt(aprTransfer.data);
        const amountFormatted = formatUnits(amount, 18);

        tokenIn = {
          address: aprMonAddress,
          symbol: "aprMON",
          amount: amount.toString(),
          amountFormatted,
        };

        summary = `Requested unstake of ${amountFormatted} aprMON (7-day waiting period)`;
      } else {
        summary = "Requested unstake from aPriori (7-day waiting period)";
      }
    }
    // 3b. Unstake Claim (aPriori Redeem - claim after waiting period)
    else if (
      logs.some(
        (l) =>
          l.topics[0]?.toLowerCase() === TOPICS.REDEEM_CLAIM.toLowerCase() &&
          l.address.toLowerCase() === CONTRACTS.APRIORI
      )
    ) {
      type = "unstake_claim";
      typeDescription = "Unstake Claim";
      protocol = "aPriori";

      // Find WMON transfer FROM aPriori to get amount received
      const wmonTransfer = logs.find(
        (l) =>
          l.topics[0]?.toLowerCase() === TOPICS.TRANSFER.toLowerCase() &&
          l.address.toLowerCase() === CONTRACTS.WMON &&
          l.topics[1] && // from address
          ("0x" + l.topics[1].slice(26)).toLowerCase() === CONTRACTS.APRIORI
      );

      if (wmonTransfer && wmonTransfer.data) {
        const amount = BigInt(wmonTransfer.data);
        const amountFormatted = formatUnits(amount, 18);
        const monInfo = await getTokenInfo(CONTRACTS.WMON);

        tokenOut = {
          address: CONTRACTS.WMON,
          symbol: "WMON",
          amount: amount.toString(),
          amountFormatted,
          valueUsd:
            monInfo.priceUsd > 0
              ? (parseFloat(amountFormatted) * monInfo.priceUsd).toFixed(2)
              : undefined,
        };
        summary = `Claimed ${amountFormatted} WMON from completed unstake`;
      } else {
        summary = "Claimed unstaked funds from aPriori";
      }
    }
    // 4. Swap - Monorail (ANY event from Monorail Router)
    else if (
      logs.some((l) => l.address.toLowerCase() === CONTRACTS.MONORAIL_ROUTER)
    ) {
      type = "swap";
      typeDescription = "Token Swap";
      protocol = "Monorail";

      // Try to extract swap details from events
      await extractSwapDetails(events, logs, (details) => {
        tokenIn = details.tokenIn;
        tokenOut = details.tokenOut;
        summary = details.summary;
        if (details.route) route.push(...details.route);
      });

      if (!summary.includes("Swapped")) {
        summary = "Swapped via Monorail DEX aggregator";
      }
    }
    // 5. Swap - check for multiple DIFFERENT tokens transferred (catches 0x swaps)
    // NOTE: WMON uses Deposit/Withdrawal events (NOT Transfer), so we must count WMON
    // separately when it's involved in a swap (e.g., MON → gMON routes via WMON)
    else {
      const erc20Transfers = logs.filter(
        (l) =>
          l.topics[0]?.toLowerCase() === TOPICS.TRANSFER.toLowerCase() &&
          l.topics.length === 3 // ERC20: [sig, from, to]
      );
      const uniqueTokens = new Set(
        erc20Transfers.map((t) => t.address.toLowerCase())
      );

      // Check for WMON Deposit/Withdrawal events (indicates MON involvement in swap)
      // Only count if WMON is NOT already in uniqueTokens (avoid double-counting)
      const hasWmonDeposit = logs.some(
        (l) =>
          l.topics[0]?.toLowerCase() === TOPICS.WMON_DEPOSIT.toLowerCase() &&
          l.address.toLowerCase() === CONTRACTS.WMON
      );
      const hasWmonWithdrawal = logs.some(
        (l) =>
          l.topics[0]?.toLowerCase() === TOPICS.WMON_WITHDRAWAL.toLowerCase() &&
          l.address.toLowerCase() === CONTRACTS.WMON
      );
      const wmonAlreadyCounted = uniqueTokens.has(CONTRACTS.WMON.toLowerCase());
      const wmonInvolved =
        (hasWmonDeposit || hasWmonWithdrawal) && !wmonAlreadyCounted;

      // Effective token count: ERC20 transfers + WMON if involved but not transferred
      const effectiveTokenCount = uniqueTokens.size + (wmonInvolved ? 1 : 0);

      if (effectiveTokenCount >= 2) {
        type = "swap";
        typeDescription = "Token Swap";
        protocol = "0x";

        await extractSwapDetails(events, logs, (details) => {
          tokenIn = details.tokenIn;
          tokenOut = details.tokenOut;
          summary = details.summary;
          if (details.route) route.push(...details.route);
        });

        if (!summary.includes("Swapped")) {
          summary = "Swapped via 0x aggregator";
        }
      }
      // 6. Wrap (ONLY if pure wrap - WMON Deposit, no other token transfers)
      else if (
        logs.some(
          (l) =>
            l.topics[0]?.toLowerCase() === TOPICS.WMON_DEPOSIT.toLowerCase() &&
            l.address.toLowerCase() === CONTRACTS.WMON
        ) &&
        !logs.some(
          (l) =>
            l.topics[0]?.toLowerCase() === TOPICS.WMON_WITHDRAWAL.toLowerCase()
        ) &&
        uniqueTokens.size <= 1
      ) {
        type = "wrap";
        typeDescription = "Wrap MON";
        protocol = "WMON";

        const wrapEvent = events.find(
          (e) =>
            e.topic0.toLowerCase() === TOPICS.WMON_DEPOSIT.toLowerCase() &&
            e.contract === CONTRACTS.WMON
        );
        if (wrapEvent) {
          const wad = wrapEvent.params.wad as bigint;
          const amountFormatted = formatUnits(wad, 18);

          tokenIn = {
            address: "0x0000000000000000000000000000000000000000",
            symbol: "MON",
            amount: wad.toString(),
            amountFormatted,
          };
          tokenOut = {
            address: CONTRACTS.WMON,
            symbol: "WMON",
            amount: wad.toString(),
            amountFormatted,
          };
          summary = `Wrapped ${amountFormatted} MON to WMON`;
        }
      }
      // 7. Unwrap (ONLY if pure unwrap - WMON Withdrawal, no other token transfers)
      else if (
        logs.some(
          (l) =>
            l.topics[0]?.toLowerCase() === TOPICS.WMON_WITHDRAWAL.toLowerCase() &&
            l.address.toLowerCase() === CONTRACTS.WMON
        ) &&
        !logs.some(
          (l) =>
            l.topics[0]?.toLowerCase() === TOPICS.WMON_DEPOSIT.toLowerCase()
        ) &&
        uniqueTokens.size <= 1
      ) {
        type = "unwrap";
        typeDescription = "Unwrap WMON";
        protocol = "WMON";

        const unwrapEvent = events.find(
          (e) =>
            e.topic0.toLowerCase() === TOPICS.WMON_WITHDRAWAL.toLowerCase() &&
            e.contract === CONTRACTS.WMON
        );
        if (unwrapEvent) {
          const wad = unwrapEvent.params.wad as bigint;
          const amountFormatted = formatUnits(wad, 18);

          tokenIn = {
            address: CONTRACTS.WMON,
            symbol: "WMON",
            amount: wad.toString(),
            amountFormatted,
          };
          tokenOut = {
            address: "0x0000000000000000000000000000000000000000",
            symbol: "MON",
            amount: wad.toString(),
            amountFormatted,
          };
          summary = `Unwrapped ${amountFormatted} WMON to MON`;
        }
      }
      // 8. Transfer (single token outflow)
      else if (erc20Transfers.length === 1) {
        type = "transfer";
        typeDescription = "Token Transfer";
        protocol = "ERC20";

        const transferEvent = events.find((e) => e.name === "Transfer");
        if (transferEvent) {
          const amount = transferEvent.params.amount as bigint;
          const to = transferEvent.params.to as string;
          const tokenInfo = await getTokenInfo(transferEvent.contract);
          const amountFormatted = formatUnits(amount, tokenInfo.decimals);

          tokenOut = {
            address: transferEvent.contract,
            symbol: tokenInfo.symbol,
            amount: amount.toString(),
            amountFormatted,
            valueUsd:
              tokenInfo.priceUsd > 0
                ? (parseFloat(amountFormatted) * tokenInfo.priceUsd).toFixed(2)
                : undefined,
          };
          counterparty = to;
          summary = `Transferred ${amountFormatted} ${tokenInfo.symbol}`;
        }
      }
      // 9. Approve (token approval - no transfers)
      else if (
        logs.some(
          (l) => l.topics[0]?.toLowerCase() === TOPICS.APPROVAL.toLowerCase()
        ) &&
        erc20Transfers.length === 0
      ) {
        type = "approve";
        typeDescription = "Token Approval";
        protocol = "ERC20";

        const approvalLog = logs.find(
          (l) => l.topics[0]?.toLowerCase() === TOPICS.APPROVAL.toLowerCase()
        );
        if (approvalLog) {
          // Approval event: topics = [sig, owner, spender], data = amount
          const spender = "0x" + (approvalLog.topics[2]?.slice(26) || "");
          const tokenInfo = await getTokenInfo(approvalLog.address);

          // Decode approval amount from data
          let approvalAmount = "unlimited";
          if (approvalLog.data && approvalLog.data !== "0x") {
            try {
              const amountWei = BigInt(approvalLog.data);
              // Check if it's max uint256 (unlimited approval)
              const MAX_UINT256 = 2n ** 256n - 1n;
              if (amountWei === MAX_UINT256 || amountWei > 10n ** 30n) {
                approvalAmount = "unlimited";
              } else {
                const formatted = formatUnits(amountWei, tokenInfo.decimals);
                approvalAmount = parseFloat(formatted).toFixed(6);
              }
            } catch {
              // Keep as unlimited if parsing fails
            }
          }

          // Set counterparty to the spender (IMPORTANT for agent explanation)
          counterparty = spender.toLowerCase();

          // Set tokenIn to show the token being approved
          tokenIn = {
            address: approvalLog.address.toLowerCase(),
            symbol: tokenInfo.symbol,
            amount: approvalAmount === "unlimited" ? "unlimited" : approvalLog.data || "0",
            amountFormatted: approvalAmount,
          };

          summary = `Approved ${approvalAmount === "unlimited" ? "unlimited" : approvalAmount} ${tokenInfo.symbol} for spender ${spender}`;
        }
      }
      // 10. Native MON Transfer (has IncreasedSpentMap but no ERC20 transfers)
      else if (
        logs.some(
          (l) =>
            l.topics[0]?.toLowerCase() === TOPICS.INCREASED_SPENT_MAP.toLowerCase()
        ) &&
        erc20Transfers.length === 0 &&
        !logs.some(
          (l) =>
            l.topics[0]?.toLowerCase() === TOPICS.WMON_DEPOSIT.toLowerCase()
        ) &&
        !logs.some(
          (l) =>
            l.topics[0]?.toLowerCase() === TOPICS.WMON_WITHDRAWAL.toLowerCase()
        )
      ) {
        type = "native_transfer";
        typeDescription = "Native Transfer";
        protocol = "MON";
        summary = "Transferred native MON";
      }
    }
  }

  // Extract Pragma fee from ValidatedPayment if present
  const vpEvent = events.find((e) => e.name === "ValidatedPayment");
  if (vpEvent && vpEvent.params.actualAmount && tokenIn) {
    const actualAmount = vpEvent.params.actualAmount as bigint;
    // Pragma takes 1% fee
    const feeAmount = actualAmount / 100n;
    const feeFormatted = formatUnits(feeAmount, 18);
    pragmaFee = {
      amount: feeAmount.toString(),
      amountFormatted: feeFormatted,
      percentage: "1%",
    };
  }

  // Calculate gas fee
  // IMPORTANT: On Monad, you're charged for gasLimit, not gasUsed!
  // See: https://docs.monad.xyz/developer-essentials/gas-pricing#gas-limit-not-gas-used
  const gasUsed = txReceipt?.gasUsed || tx.gas;
  const gasLimit = tx.gas;
  const gasPrice = txReceipt?.effectiveGasPrice || tx.gasPrice || 0n;
  const gasPriceGwei = formatUnits(gasPrice, 9); // Convert to gwei
  // Monad charges gasLimit, not gasUsed
  const gasFeeWei = gasLimit * gasPrice;
  const gasFeeFormatted = formatUnits(gasFeeWei, 18);

  // Transaction metadata
  const nonce = tx.nonce;
  const transactionIndex = tx.transactionIndex ?? 0;
  const inputDataSize = tx.input ? (tx.input.length - 2) / 2 : 0; // bytes (exclude 0x)
  const valueTransferred = formatUnits(tx.value || 0n, 18);

  // =========================================================================
  // Delegation Decoding (for redeemDelegations transactions)
  // =========================================================================
  let delegation: DelegationInfo | undefined;

  if (hasRedeemedDelegation && tx.input && selector === "0xcef6d209") {
    const decoded = decodeRedeemDelegations(tx.input);
    if (decoded && decoded.executions.length > 0) {
      const exec = decoded.executions[0];

      // Extract unique caveats from all delegations with full decoded params
      const allCaveats = new Map<string, {
        enforcerName: string;
        decodedParams: DecodedCaveatParams;
      }>();

      for (const chain of decoded.delegationChains) {
        for (const del of chain.delegations) {
          for (const caveat of del.caveats) {
            const addr = caveat.enforcer.toLowerCase();
            if (!allCaveats.has(addr)) {
              allCaveats.set(addr, {
                enforcerName: caveat.enforcerName,
                decodedParams: caveat.decodedParams,
              });
            }
          }
        }
      }

      delegation = {
        delegator: decoded.primaryDelegator || "",
        delegate: decoded.primaryDelegate || "",
        actionType: exec.txType,
        executionTarget: exec.target,
        executionTargetName: exec.targetName,
        executionValue: exec.valueFormatted,
        caveats: Array.from(allCaveats.entries()).map(([addr, info]) => ({
          enforcerAddress: addr,
          enforcerName: info.enforcerName,
          decodedParams: info.decodedParams,
        })),
      };
    }
  }

  return {
    txHash,
    blockNumber: Number(tx.blockNumber),
    timestamp,
    status: txReceipt?.status === "success" ? "success" : "failed",
    type,
    typeDescription,
    summary,
    // Transaction metadata
    nonce,
    transactionIndex,
    inputDataSize,
    valueTransferred,
    tokenIn,
    tokenOut,
    protocol,
    route: route.length > 1 ? route : undefined,
    pragmaFee,
    gasFee: {
      amount: gasFeeWei.toString(),
      amountFormatted: gasFeeFormatted,
      gasUsed: gasUsed.toString(),
      gasLimit: gasLimit.toString(),
      gasPrice: gasPrice.toString(),
      gasPriceGwei,
    },
    from: tx.from,
    to: tx.to || "",
    counterparty,
    events,
    delegation,
    // UserOp details (only for ERC-4337 handleOps transactions)
    userOp: userOpDetails
      ? {
          sender: userOpDetails.sender,
          innerTarget: userOpDetails.innerTarget,
          innerValue: userOpDetails.innerValue,
          innerCallData: userOpDetails.innerCallData,
          innerSelector: userOpDetails.innerSelector,
          innerFunctionName: userOpDetails.innerFunctionName,
        }
      : undefined,
  };
}

// ============================================================================
// Swap Detail Extraction Helper
// ============================================================================

/**
 * Fallback: Parse MonorailSwap event directly when RedeemedDelegation is not available.
 * MonorailSwap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, ...)
 * - topic1 = sender
 * - topic2 = tokenIn address (0x0 = native MON)
 * - topic3 = tokenOut address (0x0 = native MON)
 * - data = amountIn (bytes 0-31), amountOut (bytes 32-63)
 */
async function parseMonorailSwapFallback(
  logs: Array<{ address: string; topics: string[]; data: string }>
): Promise<{
  tokenIn?: TransactionExplanation["tokenIn"];
  tokenOut?: TransactionExplanation["tokenOut"];
  summary: string;
  route?: string[];
} | null> {
  const monorailSwapLog = logs.find(
    (l) =>
      l.topics[0]?.toLowerCase() === TOPICS.MONORAIL_SWAP.toLowerCase() &&
      l.address.toLowerCase() === CONTRACTS.MONORAIL_ROUTER
  );

  if (!monorailSwapLog || !monorailSwapLog.topics[2] || !monorailSwapLog.topics[3] || !monorailSwapLog.data) {
    return null;
  }

  // Extract tokenIn and tokenOut from indexed topics
  const tokenInAddress = ("0x" + monorailSwapLog.topics[2].slice(-40)).toLowerCase();
  const tokenOutAddress = ("0x" + monorailSwapLog.topics[3].slice(-40)).toLowerCase();

  // Extract amounts from data (each 32 bytes = 64 hex chars)
  const dataHex = monorailSwapLog.data.slice(2); // Remove 0x prefix
  const amountIn = BigInt("0x" + dataHex.slice(0, 64));
  const amountOut = BigInt("0x" + dataHex.slice(64, 128));

  // Determine if tokens are native MON (address 0x0)
  const isTokenInNative = tokenInAddress === "0x0000000000000000000000000000000000000000";
  const isTokenOutNative = tokenOutAddress === "0x0000000000000000000000000000000000000000";

  // Get token info (use WMON price for native MON)
  const tokenInInfo = await getTokenInfo(isTokenInNative ? CONTRACTS.WMON : tokenInAddress);
  const tokenOutInfo = await getTokenInfo(isTokenOutNative ? CONTRACTS.WMON : tokenOutAddress);

  const amountInFormatted = formatUnits(amountIn, tokenInInfo.decimals);
  const amountOutFormatted = formatUnits(amountOut, tokenOutInfo.decimals);

  const tokenInSymbol = isTokenInNative ? "MON" : tokenInInfo.symbol;
  const tokenOutSymbol = isTokenOutNative ? "MON" : tokenOutInfo.symbol;

  return {
    tokenIn: {
      address: tokenInAddress,
      symbol: tokenInSymbol,
      amount: amountIn.toString(),
      amountFormatted: amountInFormatted,
      valueUsd:
        tokenInInfo.priceUsd > 0
          ? (parseFloat(amountInFormatted) * tokenInInfo.priceUsd).toFixed(2)
          : undefined,
    },
    tokenOut: {
      address: tokenOutAddress,
      symbol: tokenOutSymbol,
      amount: amountOut.toString(),
      amountFormatted: amountOutFormatted,
      valueUsd:
        tokenOutInfo.priceUsd > 0
          ? (parseFloat(amountOutFormatted) * tokenOutInfo.priceUsd).toFixed(2)
          : undefined,
    },
    summary: `Swapped ${amountInFormatted} ${tokenInSymbol} for ${amountOutFormatted} ${tokenOutSymbol}`,
    route: [tokenInSymbol, tokenOutSymbol],
  };
}

/**
 * Extract swap details from transaction events.
 *
 * Strategy:
 * 1. Identify the smart account (delegator) from RedeemedDelegation event
 * 2. tokenIn = ALL tokens sent FROM the smart account (user's input)
 * 3. tokenOut = Check for WMON Withdrawal event first (means user gets native MON)
 *               Otherwise, ALL tokens sent TO the smart account
 *
 * Fallback: If no RedeemedDelegation event, parse MonorailSwap event directly.
 */
async function extractSwapDetails(
  events: DecodedEvent[],
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
    blockNumber: bigint;
    transactionHash: string;
    logIndex: number;
  }>,
  callback: (details: {
    tokenIn?: TransactionExplanation["tokenIn"];
    tokenOut?: TransactionExplanation["tokenOut"];
    summary: string;
    route?: string[];
  }) => void
): Promise<void> {
  // Step 1: Find the smart account (delegator) from RedeemedDelegation event
  // RedeemedDelegation: topic1 = delegator (smart account), topic2 = enforcer
  const redeemedLog = logs.find(
    (l) =>
      l.topics[0]?.toLowerCase() === TOPICS.REDEEMED_DELEGATION.toLowerCase() &&
      l.address.toLowerCase() === CONTRACTS.DELEGATION_MANAGER
  );

  let smartAccount = "";
  if (redeemedLog && redeemedLog.topics[1]) {
    smartAccount = ("0x" + redeemedLog.topics[1].slice(26)).toLowerCase();
  }

  if (!smartAccount) {
    // Fallback: Try parsing MonorailSwap event directly (for txs without RedeemedDelegation)
    const fallbackResult = await parseMonorailSwapFallback(logs);
    if (fallbackResult) {
      callback(fallbackResult);
      return;
    }
    // No smart account and no MonorailSwap event - return generic summary
    callback({ summary: "Token swap" });
    return;
  }

  // Step 2: Find all ERC20 transfers
  const transfers = events.filter((e) => e.name === "Transfer");

  // Step 3: Calculate tokens sent FROM the smart account
  const tokensOut = new Map<string, bigint>(); // token address -> total amount OUT from smart account

  for (const t of transfers) {
    const from = (t.params.from as string)?.toLowerCase() || "";
    if (from === smartAccount) {
      const tokenAddr = t.contract.toLowerCase();
      const amount = (t.params.amount as bigint) || 0n;
      tokensOut.set(tokenAddr, (tokensOut.get(tokenAddr) || 0n) + amount);
    }
  }

  // Step 4: Find tokens sent TO the smart account (user's received tokens)
  const tokensIn = new Map<string, bigint>();
  for (const t of transfers) {
    const to = (t.params.to as string)?.toLowerCase() || "";
    if (to === smartAccount) {
      const tokenAddr = t.contract.toLowerCase();
      const amount = (t.params.amount as bigint) || 0n;
      tokensIn.set(tokenAddr, (tokensIn.get(tokenAddr) || 0n) + amount);
    }
  }

  // Step 5: Determine tokenOut - what user actually received
  // Priority: Non-WMON token TO smart account > WMON Withdrawal (if no other token)
  let tokenOutAddr = "";
  let tokenOutAmount = 0n;
  let tokenOutSymbol = "";

  // First check for any non-WMON tokens sent TO smart account
  let maxInAmount = 0n;
  for (const [addr, amount] of tokensIn) {
    // Skip if this token was also sent out (intermediate token)
    if (tokensOut.has(addr)) continue;
    // Skip WMON if there's a withdrawal (WMON is intermediate)
    if (addr === CONTRACTS.WMON) continue;
    if (amount > maxInAmount) {
      maxInAmount = amount;
      tokenOutAddr = addr;
      tokenOutAmount = amount;
    }
  }

  // If no other token received, check for WMON received OR WMON Withdrawal
  if (tokenOutAmount === 0n) {
    // Check if WMON was received (and NOT passed through)
    const wmonReceived = tokensIn.get(CONTRACTS.WMON) || 0n;
    const wmonSent = tokensOut.get(CONTRACTS.WMON) || 0n;
    const netWmonIn = wmonReceived > wmonSent ? wmonReceived - wmonSent : 0n;

    // Check for WMON Withdrawal event (means output is native MON)
    const withdrawalEvent = events.find(
      (e) =>
        e.topic0.toLowerCase() === TOPICS.WMON_WITHDRAWAL.toLowerCase() &&
        e.contract.toLowerCase() === CONTRACTS.WMON
    );

    if (withdrawalEvent && withdrawalEvent.params.wad) {
      // WMON was unwrapped - output is native MON
      tokenOutAddr = "0x0000000000000000000000000000000000000000";
      tokenOutAmount = withdrawalEvent.params.wad as bigint;
      tokenOutSymbol = "MON";
    } else if (netWmonIn > 0n) {
      // User received WMON (net positive)
      tokenOutAddr = CONTRACTS.WMON;
      tokenOutAmount = netWmonIn;
      tokenOutSymbol = "WMON";
    }
  }

  // Step 6: Determine tokenIn - what user actually spent
  // Priority: ERC20 from smart account > WMON Deposit (native MON wrapped)
  let tokenInAddr = "";
  let tokenInAmount = 0n;

  // First check for tokens sent FROM smart account (excluding WMON if it's intermediate)
  let maxOutAmount = 0n;
  for (const [addr, amount] of tokensOut) {
    // Skip WMON if there's a deposit event (WMON is intermediate, user sent native MON)
    const depositEvent = events.find(
      (e) =>
        e.topic0.toLowerCase() === TOPICS.WMON_DEPOSIT.toLowerCase() &&
        e.contract.toLowerCase() === CONTRACTS.WMON
    );
    if (addr === CONTRACTS.WMON && depositEvent) continue;

    if (amount > maxOutAmount) {
      maxOutAmount = amount;
      tokenInAddr = addr;
      tokenInAmount = amount;
    }
  }

  // If no ERC20 sent from smart account, check for WMON Deposit (user sent native MON)
  if (tokenInAmount === 0n) {
    const depositEvent = events.find(
      (e) =>
        e.topic0.toLowerCase() === TOPICS.WMON_DEPOSIT.toLowerCase() &&
        e.contract.toLowerCase() === CONTRACTS.WMON
    );
    if (depositEvent && depositEvent.params.wad) {
      tokenInAddr = "0x0000000000000000000000000000000000000000";
      tokenInAmount = depositEvent.params.wad as bigint;
    }
  }

  // Step 6b: If we found tokenOut but no tokenIn, try MonorailSwap fallback for complete info
  // This handles cases where native MON is sent directly to router (no WMON Deposit event)
  if (!tokenInAddr && tokenOutAmount > 0n) {
    const fallbackResult = await parseMonorailSwapFallback(logs);
    if (fallbackResult) {
      callback(fallbackResult);
      return;
    }
  }

  // Step 7: Build result
  if (tokenInAddr && tokenOutAmount > 0n) {
    // Get token info - for native MON (zero address), use WMON price
    const tokenInInfo = tokenInAddr === "0x0000000000000000000000000000000000000000"
      ? { address: tokenInAddr, symbol: "MON", decimals: 18, priceUsd: await getTokenInfo(CONTRACTS.WMON).then(i => i.priceUsd) }
      : await getTokenInfo(tokenInAddr);
    const tokenOutInfo = tokenOutSymbol === "MON"
      ? { address: tokenOutAddr, symbol: "MON", decimals: 18, priceUsd: await getTokenInfo(CONTRACTS.WMON).then(i => i.priceUsd) }
      : await getTokenInfo(tokenOutAddr);

    const amountInFormatted = formatUnits(tokenInAmount, tokenInInfo.decimals);
    const amountOutFormatted = formatUnits(tokenOutAmount, tokenOutInfo.decimals);

    // Build route from distinct tokens in order
    const route: string[] = [];
    const seenTokens = new Set<string>();
    for (const t of transfers) {
      const addr = t.contract.toLowerCase();
      if (!seenTokens.has(addr)) {
        const info = await getTokenInfo(addr);
        route.push(info.symbol);
        seenTokens.add(addr);
      }
    }
    // If output is MON (unwrapped), add it to route
    if (tokenOutSymbol === "MON" && !seenTokens.has("0x0000000000000000000000000000000000000000")) {
      route.push("MON");
    }

    callback({
      tokenIn: {
        address: tokenInAddr,
        symbol: tokenInInfo.symbol,
        amount: tokenInAmount.toString(),
        amountFormatted: amountInFormatted,
        valueUsd:
          tokenInInfo.priceUsd > 0
            ? (parseFloat(amountInFormatted) * tokenInInfo.priceUsd).toFixed(2)
            : undefined,
      },
      tokenOut: {
        address: tokenOutAddr,
        symbol: tokenOutSymbol || tokenOutInfo.symbol,
        amount: tokenOutAmount.toString(),
        amountFormatted: amountOutFormatted,
        valueUsd:
          tokenOutInfo.priceUsd > 0
            ? (parseFloat(amountOutFormatted) * tokenOutInfo.priceUsd).toFixed(2)
            : undefined,
      },
      summary: `Swapped ${amountInFormatted} ${tokenInInfo.symbol} for ${amountOutFormatted} ${tokenOutSymbol || tokenOutInfo.symbol}`,
      route,
    });
  } else {
    callback({ summary: "Token swap" });
  }
}
