/**
 * Explain Transaction Tool
 *
 * Provides detailed human-readable explanation of any transaction.
 * Decodes logs, identifies protocols, and explains what happened.
 * Returns comprehensive structured data for the agent to analyze.
 *
 * Use this tool when:
 * - User asks "explain this transaction", "what happened in 0x..."
 * - User wants to understand a specific swap, stake, or transfer
 * - User asks "tell me about this tx"
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { isHex } from "viem";

import { createErrorFromCode } from "../../errors/index.js";
import { emitProgress } from "../progress/emitter.js";

// ============================================================================
// Types
// ============================================================================

interface DecodedCaveatParams {
  timestampAfter?: number;
  timestampBefore?: number;
  nonce?: string;
  callLimit?: number;
  nativeAllowance?: string;
  nativeAllowanceFormatted?: string;
  erc20Token?: string;
  erc20MaxAmount?: string;
  erc20MaxAmountFormatted?: string;
  allowedTargets?: string[];
  allowedTargetNames?: string[];
  allowedMethods?: string[];
  allowedMethodNames?: string[];
  calldataConstraints?: Array<{
    startIndex: number;
    value: string;
    description?: string;
  }>;
  expectedArgs?: string;
  expectedCaller?: string;
  rawTerms?: string;
  rawArgs?: string;
}

interface DelegationInfo {
  delegator: string;
  delegate: string;
  actionType: string;
  executionTarget: string;
  executionTargetName: string | null;
  executionValue: string;
  caveats: Array<{
    enforcerName: string;
    enforcerAddress: string;
    decodedParams: DecodedCaveatParams;
  }>;
}

interface UserOpDetails {
  sender: string;
  innerTarget: string;
  innerValue: string;
  innerCallData: string;
  innerSelector: string;
  innerFunctionName: string;
}

interface TransactionExplanation {
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
  valueTransferred: string;
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
    // NFT-specific
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
  events: Array<{
    name: string;
    contract: string;
    contractName?: string;
    protocol?: string;
    params: Record<string, string | bigint>;
  }>;
  delegation?: DelegationInfo;
  userOp?: UserOpDetails;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatTimestamp(timestamp: number): string {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp * 1000);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatToken(token: TransactionExplanation["tokenIn"]): string {
  if (!token) return "";

  const amount = parseFloat(token.amountFormatted);
  const formatted = amount < 0.0001 ? amount.toFixed(8) : amount < 0.01 ? amount.toFixed(6) : amount.toFixed(4);

  if (token.valueUsd) {
    return `**${formatted} ${token.symbol}** ($${token.valueUsd})`;
  }
  return `**${formatted} ${token.symbol}**`;
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || "Unknown";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getTypeEmoji(type: string): string {
  const emojiMap: Record<string, string> = {
    swap: "🔄",
    stake: "📈",
    unstake: "📉",
    unstake_request: "⏳",
    unstake_claim: "💰",
    transfer: "💸",
    transfer_in: "📥",
    transfer_out: "📤",
    native_transfer: "💸",
    wrap: "📦",
    unwrap: "📭",
    nft_buy: "🖼️",
    nft_purchase: "🖼️",
    nft_sell: "🏷️",
    nft_transfer: "🎁",
    approve: "✅",
    session_key_funding: "🔑",
    delegation_registration: "📝",
    user_operation: "⚙️",
    unknown: "📋",
  };
  return emojiMap[type.toLowerCase()] || "📋";
}

/**
 * Format UserOp details for ERC-4337 transactions
 */
function formatUserOp(userOp: UserOpDetails): string {
  let output = `\n---\n\n## ⚙️ ERC-4337 UserOperation Details\n\n`;
  output += `This transaction was submitted via **Account Abstraction (ERC-4337)**.\n\n`;

  output += `| Field | Value |\n`;
  output += `|-------|-------|\n`;
  output += `| **Smart Account** | \`${userOp.sender}\` |\n`;
  output += `| **Inner Target** | \`${userOp.innerTarget}\` |\n`;
  output += `| **Inner Value** | ${userOp.innerValue} MON |\n`;
  output += `| **Inner Function** | ${userOp.innerFunctionName}() |\n`;

  if (userOp.innerCallData && userOp.innerCallData !== "0x") {
    output += `| **Inner Calldata** | \`${userOp.innerCallData.slice(0, 34)}...\` |\n`;
  } else {
    output += `| **Inner Calldata** | (empty - native transfer) |\n`;
  }

  output += `\n`;
  return output;
}

/**
 * Format Gas Economics section with Monad-specific explanation
 */
function formatGasEconomics(gasFee: TransactionExplanation["gasFee"]): string {
  const gasUsed = parseInt(gasFee.gasUsed).toLocaleString();
  const gasLimit = parseInt(gasFee.gasLimit).toLocaleString();
  const gasPrice = gasFee.gasPriceGwei;
  const gasCost = parseFloat(gasFee.amountFormatted).toFixed(8);

  // Calculate efficiency
  const usedNum = parseInt(gasFee.gasUsed);
  const limitNum = parseInt(gasFee.gasLimit);
  const efficiency = limitNum > 0 ? ((usedNum / limitNum) * 100).toFixed(1) : "0";

  let output = `\n### ⛽ Gas Economics\n\n`;
  output += `| Metric | Value |\n`;
  output += `|--------|-------|\n`;
  output += `| **Gas Limit** | ${gasLimit} |\n`;
  output += `| **Gas Used** | ${gasUsed} (${efficiency}% of limit) |\n`;
  output += `| **Gas Price** | ${gasPrice} gwei |\n`;
  output += `| **Total Cost** | ${gasCost} MON |\n`;

  output += `\n> ⚠️ **Monad Gas Model**: On Monad, you're charged for the full **gas limit**, not gas used. `;
  output += `Gas used (${gasUsed}) is informational only — the actual cost is calculated as \`gasLimit × gasPrice\`. `;
  output += `[Learn more](https://docs.monad.xyz/developer-essentials/gas-pricing#gas-limit-not-gas-used)\n`;

  return output;
}

// Detailed enforcer descriptions
const ENFORCER_DETAILS: Record<string, { name: string; description: string; securityLevel: string }> = {
  IdEnforcer: {
    name: "Identity Enforcer",
    description: "Verifies the identity of the delegator and delegate match the delegation chain",
    securityLevel: "🔒 Core Security",
  },
  NativeTokenTransferAmountEnforcer: {
    name: "MON Transfer Limit",
    description: "Restricts the maximum amount of native MON that can be transferred in a single execution",
    securityLevel: "💰 Value Protection",
  },
  TimestampEnforcer: {
    name: "Time Validity",
    description: "Ensures the delegation is only valid within a specific time window (start/end timestamps)",
    securityLevel: "⏰ Temporal Control",
  },
  NonceEnforcer: {
    name: "Replay Protection",
    description: "Prevents replay attacks by tracking execution nonces - each delegation can only be used a specific number of times",
    securityLevel: "🛡️ Replay Defense",
  },
  LimitedCallsEnforcer: {
    name: "Call Limit",
    description: "Limits the total number of times this delegation can be executed (e.g., max 5 swaps)",
    securityLevel: "🔢 Usage Limit",
  },
  AllowedMethodsEnforcer: {
    name: "Function Whitelist",
    description: "Restricts which smart contract functions can be called (e.g., only swap() and transfer())",
    securityLevel: "📝 Method Control",
  },
  AllowedCalldataEnforcer: {
    name: "Calldata Validator",
    description: "Validates specific parameters in the function call data match expected values",
    securityLevel: "🔍 Parameter Validation",
  },
  ArgsEqualityCheckEnforcer: {
    name: "Argument Equality",
    description: "Ensures specific function arguments exactly match pre-defined values",
    securityLevel: "⚖️ Strict Matching",
  },
  PragmaFeeEnforcer: {
    name: "Protocol Fee",
    description: "Enforces the 1% Pragma protocol fee is paid on applicable transactions",
    securityLevel: "💵 Fee Collection",
  },
  AllowedTargetsEnforcer: {
    name: "Contract Whitelist",
    description: "Restricts which smart contracts can be called (e.g., only Monorail and aPriori)",
    securityLevel: "🎯 Target Control",
  },
};


/**
 * Format a timestamp as human-readable date
 */
function formatTimestampFull(ts: number): string {
  if (!ts || ts === 0) return "N/A";
  const date = new Date(ts * 1000);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

/**
 * Format decoded caveat parameters for security audit display
 */
function formatCaveatParams(params: DecodedCaveatParams, enforcerName: string): string {
  const lines: string[] = [];

  switch (enforcerName) {
    case "TimestampEnforcer":
      if (params.timestampAfter) {
        lines.push(`  - **Valid After:** ${formatTimestampFull(params.timestampAfter)} (Unix: ${params.timestampAfter})`);
      }
      if (params.timestampBefore) {
        lines.push(`  - **Valid Until:** ${formatTimestampFull(params.timestampBefore)} (Unix: ${params.timestampBefore})`);
      }
      break;

    case "NonceEnforcer":
      if (params.nonce !== undefined) {
        lines.push(`  - **Required Nonce:** ${params.nonce}`);
        lines.push(`  - *This delegation is only valid when the smart account's nonce equals this value*`);
      }
      break;

    case "LimitedCallsEnforcer":
      if (params.callLimit !== undefined) {
        lines.push(`  - **Max Executions:** ${params.callLimit}`);
        lines.push(`  - *After ${params.callLimit} use(s), this delegation becomes invalid*`);
      }
      break;

    case "NativeTokenTransferAmountEnforcer":
      if (params.nativeAllowanceFormatted) {
        lines.push(`  - **Max Transfer:** ${params.nativeAllowanceFormatted}`);
        lines.push(`  - *Session key cannot transfer more than this amount of native MON*`);
      }
      break;

    case "ERC20TransferAmountEnforcer":
      if (params.erc20Token && params.erc20MaxAmountFormatted) {
        lines.push(`  - **Token:** \`${params.erc20Token}\``);
        lines.push(`  - **Max Amount:** ${params.erc20MaxAmountFormatted}`);
      }
      break;

    case "AllowedTargetsEnforcer":
      if (params.allowedTargets && params.allowedTargets.length > 0) {
        lines.push(`  - **Whitelisted Contracts:**`);
        for (let i = 0; i < params.allowedTargets.length; i++) {
          const addr = params.allowedTargets[i];
          const name = params.allowedTargetNames?.[i] || "Unknown";
          lines.push(`    - ${name} (\`${addr.slice(0, 10)}...${addr.slice(-8)}\`)`);
        }
      }
      break;

    case "AllowedMethodsEnforcer":
      if (params.allowedMethods && params.allowedMethods.length > 0) {
        lines.push(`  - **Allowed Functions:**`);
        for (let i = 0; i < params.allowedMethods.length; i++) {
          const selector = params.allowedMethods[i];
          const name = params.allowedMethodNames?.[i] || "unknown";
          lines.push(`    - \`${selector}\` → ${name}`);
        }
      }
      break;

    case "AllowedCalldataEnforcer":
      if (params.calldataConstraints && params.calldataConstraints.length > 0) {
        lines.push(`  - **Calldata Constraints:**`);
        for (const c of params.calldataConstraints) {
          lines.push(`    - Offset ${c.startIndex} (${c.description || "parameter"}): \`${c.value.slice(0, 18)}...\``);
        }
      }
      break;

    case "IdEnforcer":
      if (params.expectedCaller) {
        lines.push(`  - **Required Caller:** \`${params.expectedCaller}\``);
      }
      break;

    case "PragmaFeeEnforcer":
      lines.push(`  - **Fee Rate:** 1% of transaction value`);
      lines.push(`  - *Automatically deducted and sent to Pragma treasury*`);
      break;

    default:
      // Show raw terms if available for unknown enforcers
      if (params.rawTerms && params.rawTerms !== "0x") {
        lines.push(`  - **Raw Terms:** \`${params.rawTerms.slice(0, 42)}${params.rawTerms.length > 42 ? "..." : ""}\``);
      }
      break;
  }

  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

/**
 * Format delegation info with detailed enforcer explanations and decoded parameters
 * Written in security auditor style for comprehensive analysis
 */
function formatDelegation(delegation: DelegationInfo, isPragmaTx: boolean): string {
  if (!isPragmaTx) return "";

  let output = `\n---\n\n## 🔐 Pragma Delegation Security Analysis\n\n`;

  // Explain the delegation flow clearly for the agent to visualize
  output += `### How This Transaction Works\n\n`;
  output += `This transaction uses **Pragma's delegation system** (MetaMask Delegation Toolkit):\n\n`;
  output += `1. **Delegation Created**: The Smart Account (\`${delegation.delegator.slice(0, 10)}...\`) created a delegation granting the Session Key permission to act on its behalf\n`;
  output += `2. **Session Key Carries Delegation**: The Session Key (\`${delegation.delegate.slice(0, 10)}...\`) carries this signed delegation as proof of authority\n`;
  output += `3. **Redemption & Enforcement**: When the Session Key calls \`redeemDelegations()\`, the DelegationManager verifies the delegation chain and **all caveats (enforcers) must pass** before execution proceeds\n`;
  output += `4. **Execution**: Only after all enforcers validate, the action is executed from the Smart Account's context\n\n`;

  output += `**IMPORTANT FOR VISUALIZATION**: Use a mermaid flowchart to show:\n`;
  output += `- Smart Account (delegator) creates delegation with caveats\n`;
  output += `- Session Key (delegate) carries the delegation\n`;
  output += `- DelegationManager verifies chain + enforcers\n`;
  output += `- Each enforcer check (TimestampEnforcer, NonceEnforcer, etc.)\n`;
  output += `- Final execution on target contract\n\n`;

  // Delegation chain table
  output += `### 📋 Delegation Chain\n\n`;
  output += `| Role | Address | Description |\n`;
  output += `|------|---------|-------------|\n`;
  output += `| **Delegator** | \`${delegation.delegator}\` | Smart Account (holds funds, creates delegation) |\n`;
  output += `| **Delegate** | \`${delegation.delegate}\` | Session Key (carries delegation, initiates tx) |\n`;

  // Action type with security context
  const actionExplanations: Record<string, { description: string; risk: string }> = {
    swap: { description: "Token swap via approved DEX", risk: "Medium - funds leave wallet" },
    stake: { description: "Stake MON in aPriori vault", risk: "Low - funds locked in protocol" },
    unstake_request: { description: "Initiate unstake from aPriori", risk: "Low - withdrawal request" },
    unstake_claim: { description: "Claim unstaked funds", risk: "Low - receiving funds" },
    nft_buy: { description: "Purchase NFT via Seaport", risk: "Medium - funds exchanged for NFT" },
    nft_transfer: { description: "Transfer NFT to another address", risk: "High - NFT leaves wallet" },
    wrap: { description: "Wrap MON to WMON", risk: "Low - reversible operation" },
    unwrap: { description: "Unwrap WMON to MON", risk: "Low - reversible operation" },
    approve: { description: "Approve token spending", risk: "⚠️ High - grants spending rights" },
    transfer: { description: "Transfer ERC20 tokens", risk: "High - funds leave wallet" },
    native_transfer: { description: "Transfer native MON", risk: "High - funds leave wallet" },
  };

  const actionInfo = actionExplanations[delegation.actionType] || {
    description: "Authorized action",
    risk: "Unknown"
  };

  output += `\n### ⚡ Execution Details\n\n`;
  output += `| Property | Value |\n`;
  output += `|----------|-------|\n`;
  output += `| **Action Type** | ${delegation.actionType.toUpperCase()} |\n`;
  output += `| **Description** | ${actionInfo.description} |\n`;
  output += `| **Risk Level** | ${actionInfo.risk} |\n`;

  if (delegation.executionTargetName) {
    output += `| **Target Contract** | ${delegation.executionTargetName} |\n`;
    output += `| **Target Address** | \`${delegation.executionTarget}\` |\n`;
  } else if (delegation.executionTarget) {
    output += `| **Target Address** | \`${delegation.executionTarget}\` |\n`;
  }

  if (delegation.executionValue && !delegation.executionValue.startsWith("0.000000")) {
    output += `| **Native Value** | ${delegation.executionValue} |\n`;
  }

  // Security enforcers with decoded parameters
  if (delegation.caveats.length > 0) {
    output += `\n### 🛡️ Security Enforcers (${delegation.caveats.length} active)\n\n`;
    output += `These on-chain smart contracts enforce restrictions on what the session key can do. `;
    output += `All constraints must pass for the transaction to succeed.\n\n`;

    for (const caveat of delegation.caveats) {
      const details = ENFORCER_DETAILS[caveat.enforcerName] || {
        name: caveat.enforcerName,
        description: "Custom enforcer with specific constraints",
        securityLevel: "🔧 Custom",
      };

      output += `#### ${details.securityLevel} ${details.name}\n\n`;
      output += `${details.description}\n\n`;

      // Add decoded parameters
      const paramOutput = formatCaveatParams(caveat.decodedParams, caveat.enforcerName);
      if (paramOutput) {
        output += `**Configured Parameters:**\n${paramOutput}\n`;
      }

      output += `*Enforcer Contract: \`${caveat.enforcerAddress}\`*\n\n`;
    }

    // Security summary
    output += `### 🔍 Security Summary\n\n`;

    const hasTimestamp = delegation.caveats.some(c => c.enforcerName === "TimestampEnforcer");
    const hasNonce = delegation.caveats.some(c => c.enforcerName === "NonceEnforcer");
    const hasCallLimit = delegation.caveats.some(c => c.enforcerName === "LimitedCallsEnforcer");
    const hasTargetWhitelist = delegation.caveats.some(c => c.enforcerName === "AllowedTargetsEnforcer");
    const hasMethodWhitelist = delegation.caveats.some(c => c.enforcerName === "AllowedMethodsEnforcer");
    const hasAmountLimit = delegation.caveats.some(c =>
      c.enforcerName === "NativeTokenTransferAmountEnforcer" ||
      c.enforcerName === "ERC20TransferAmountEnforcer"
    );

    output += `| Security Check | Status |\n`;
    output += `|----------------|--------|\n`;
    output += `| Time-bounded | ${hasTimestamp ? "✅ Yes" : "❌ No expiry"} |\n`;
    output += `| Replay-protected | ${hasNonce ? "✅ Nonce enforced" : "⚠️ No nonce"} |\n`;
    output += `| Usage-limited | ${hasCallLimit ? "✅ Call limit set" : "⚠️ Unlimited uses"} |\n`;
    output += `| Target-restricted | ${hasTargetWhitelist ? "✅ Whitelist active" : "⚠️ Any target"} |\n`;
    output += `| Method-restricted | ${hasMethodWhitelist ? "✅ Function whitelist" : "⚠️ Any function"} |\n`;
    output += `| Amount-capped | ${hasAmountLimit ? "✅ Amount limit" : "⚠️ No cap"} |\n`;
  }

  return output;
}

/**
 * Build comprehensive token movement section
 */
function formatTokenMovements(data: TransactionExplanation): string {
  const type = data.type.toLowerCase();
  let output = "";

  if (!data.tokenIn && !data.tokenOut) return "";

  output += `---\n\n### 💱 Token Movements\n\n`;

  switch (type) {
    case "swap":
      if (data.tokenIn && data.tokenOut) {
        output += `| Direction | Token | Amount | USD Value |\n`;
        output += `|-----------|-------|--------|----------|\n`;
        output += `| **Spent** | ${data.tokenIn.symbol} | ${parseFloat(data.tokenIn.amountFormatted).toFixed(6)} | ${data.tokenIn.valueUsd ? `$${data.tokenIn.valueUsd}` : '-'} |\n`;
        output += `| **Received** | ${data.tokenOut.symbol} | ${parseFloat(data.tokenOut.amountFormatted).toFixed(6)} | ${data.tokenOut.valueUsd ? `$${data.tokenOut.valueUsd}` : '-'} |\n`;
      }
      break;

    case "stake":
      if (data.tokenIn && data.tokenOut) {
        output += `| Action | Token | Amount |\n`;
        output += `|--------|-------|--------|\n`;
        output += `| **Deposited** | ${data.tokenIn.symbol} | ${parseFloat(data.tokenIn.amountFormatted).toFixed(6)} |\n`;
        output += `| **Minted** | ${data.tokenOut.symbol} | ${parseFloat(data.tokenOut.amountFormatted).toFixed(6)} |\n`;
        output += `\n*${data.tokenOut.symbol} is a liquid staking token that accrues staking rewards over time.*\n`;
      }
      break;

    case "unstake_request":
      if (data.tokenIn) {
        output += `**Queued for Unstaking:** ${formatToken(data.tokenIn)}\n\n`;
        output += `⏳ *Note: aPriori uses a 7-day epoch-based withdrawal. Your funds will be claimable after the current epoch ends.*\n`;
      }
      break;

    case "unstake_claim":
      if (data.tokenOut) {
        output += `**Claimed:** ${formatToken(data.tokenOut)}\n\n`;
        output += `✅ *Your unstake request has completed. WMON can be unwrapped to MON if needed.*\n`;
      }
      break;

    case "wrap":
      if (data.tokenIn && data.tokenOut) {
        output += `**Wrapped:** ${formatToken(data.tokenIn)} → ${formatToken(data.tokenOut)}\n\n`;
        output += `*WMON is an ERC20 representation of native MON, required for DeFi interactions.*\n`;
      }
      break;

    case "unwrap":
      if (data.tokenIn && data.tokenOut) {
        output += `**Unwrapped:** ${formatToken(data.tokenIn)} → ${formatToken(data.tokenOut)}\n\n`;
        output += `*Converted wrapped MON back to native MON.*\n`;
      }
      break;

    case "nft_purchase":
    case "nft_buy":
      if (data.tokenIn && data.tokenOut) {
        output += `**Payment:** ${formatToken(data.tokenIn)}\n`;
        const nftName = data.tokenOut.nftName || data.tokenOut.symbol || "NFT";
        const collection = data.tokenOut.collection || "Unknown Collection";
        output += `**NFT Acquired:** ${nftName}\n`;
        output += `**Collection:** ${collection}\n`;
        if (data.tokenOut.tokenId) {
          output += `**Token ID:** #${data.tokenOut.tokenId}\n`;
        }
      }
      break;

    case "nft_transfer":
      if (data.tokenOut) {
        const nftName = data.tokenOut.nftName || data.tokenOut.symbol || "NFT";
        const collection = data.tokenOut.collection;
        output += `**NFT Transferred:** ${nftName}\n`;
        if (collection) {
          output += `**Collection:** ${collection}\n`;
        }
        if (data.tokenOut.tokenId) {
          output += `**Token ID:** #${data.tokenOut.tokenId}\n`;
        }
        if (data.tokenOut.address) {
          output += `**Contract:** \`${data.tokenOut.address}\`\n`;
        }
        if (data.counterparty) {
          output += `**Recipient:** \`${data.counterparty}\`\n`;
        }
      }
      break;

    case "transfer":
    case "transfer_out":
      if (data.tokenOut) {
        output += `**Sent:** ${formatToken(data.tokenOut)}\n`;
        if (data.counterparty) {
          output += `**To:** \`${data.counterparty}\`\n`;
        }
      }
      break;

    case "transfer_in":
      if (data.tokenIn) {
        output += `**Received:** ${formatToken(data.tokenIn)}\n`;
        if (data.counterparty) {
          output += `**From:** \`${data.counterparty}\`\n`;
        }
      }
      break;

    case "native_transfer":
      if (data.tokenIn) {
        output += `**Sent:** ${formatToken(data.tokenIn)} (native MON)\n`;
        if (data.counterparty) {
          output += `**To:** \`${data.counterparty}\`\n`;
        }
      }
      break;

    case "approve":
      if (data.tokenIn && data.counterparty) {
        output += `| Field | Value |\n`;
        output += `|-------|-------|\n`;
        output += `| **Token** | ${data.tokenIn.symbol} |\n`;
        output += `| **Token Address** | \`${data.tokenIn.address}\` |\n`;
        output += `| **Approved Amount** | ${data.tokenIn.amountFormatted} |\n`;
        output += `| **Spender** | \`${data.counterparty}\` |\n`;
        output += `\n⚠️ **Security Notice**: This approval allows the spender contract to transfer up to the approved amount of ${data.tokenIn.symbol} from your wallet. `;
        output += `Always verify you trust the spender contract before approving tokens.\n`;
      } else {
        output += `*Token approval - spending permission granted to a contract.*\n`;
      }
      break;

    default:
      // Generic handling for any remaining types
      if (data.tokenIn) {
        output += `**Input:** ${formatToken(data.tokenIn)}\n`;
      }
      if (data.tokenOut) {
        output += `**Output:** ${formatToken(data.tokenOut)}\n`;
      }
  }

  return output + "\n";
}

/**
 * Format events for display
 */
function formatEvents(events: TransactionExplanation["events"], limit: number = 5): string {
  if (!events || events.length === 0) return "";

  // Filter to most relevant events
  const relevantEvents = events
    .filter(e => ["Transfer", "Swap", "Deposit", "Withdrawal", "Approval", "OrderFulfilled", "RedeemRequest", "Redeem"].includes(e.name))
    .slice(0, limit);

  if (relevantEvents.length === 0) return "";

  let output = `\n### 📋 Key Events\n\n`;
  output += `| Event | Contract | Details |\n`;
  output += `|-------|----------|--------|\n`;

  for (const event of relevantEvents) {
    const contractDisplay = event.contractName || shortAddr(event.contract);
    let details = "";

    // Format params for common events
    if (event.name === "Transfer" && event.params.amount) {
      details = `amount: ${event.params.amount}`;
    } else if (event.name === "Approval" && event.params.spender) {
      details = `spender: ${shortAddr(event.params.spender as string)}`;
    } else {
      details = Object.entries(event.params).slice(0, 2).map(([k, v]) => `${k}: ${typeof v === 'string' && v.length > 20 ? shortAddr(v) : v}`).join(", ");
    }

    output += `| ${event.name} | ${contractDisplay} | ${details} |\n`;
  }

  if (events.length > limit) {
    output += `\n*... and ${events.length - limit} more events*\n`;
  }

  return output;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export const explainTransactionTool = tool(
  async (input, config) => {
    try {
      const { txHash } = input;

      // Validate transaction hash
      if (!isHex(txHash) || txHash.length !== 66) {
        throw createErrorFromCode("INVALID_PARAMETER", {
          message: "Invalid transaction hash. Expected format: 0x + 64 hex characters",
        });
      }

      const toolSignature = `explainTransaction:${txHash.slice(0, 18)}`;

      emitProgress(
        "Fetching transaction data...",
        "explainTransactions",
        toolSignature,
        `Analyzing ${txHash.slice(0, 10)}...`
      );

      const fetchFn = (config?.configurable?.fetch as typeof fetch) || fetch;

      const response = await fetchFn(
        `/api/hypersync/transaction?hash=${txHash}`
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);

        if (response.status === 404) {
          throw createErrorFromCode("NOT_FOUND", {
            message: `Transaction not found: ${txHash}. It may not be indexed yet or may be on a different network.`,
          });
        }

        throw new Error(`Failed to fetch transaction: ${errorText}`);
      }

      const data: TransactionExplanation = await response.json();

      emitProgress("Building transaction analysis...", "explainTransactions", toolSignature);

      // Determine if this is a Pragma transaction
      const isPragmaTx = !!data.delegation;

      // Build comprehensive explanation
      const emoji = getTypeEmoji(data.type);
      const statusEmoji = data.status === "success" ? "✅" : "❌";
      const statusText = data.status === "success" ? "Success" : "Failed";

      // =====================================================================
      // Build output
      // =====================================================================

      let explanation = `# ${emoji} ${data.typeDescription}\n\n`;
      explanation += `> ${data.summary}\n\n`;

      // Transaction overview
      explanation += `## 📊 Transaction Overview\n\n`;
      explanation += `| Field | Value |\n`;
      explanation += `|-------|-------|\n`;
      explanation += `| **Status** | ${statusEmoji} ${statusText} |\n`;
      explanation += `| **Block** | ${data.blockNumber.toLocaleString()} (#${data.transactionIndex} in block) |\n`;
      explanation += `| **Time** | ${formatTimestamp(data.timestamp)} |\n`;
      explanation += `| **From** | \`${data.from}\` (nonce: ${data.nonce}) |\n`;
      explanation += `| **To** | \`${data.to || 'Contract Creation'}\` |\n`;

      if (data.protocol) {
        explanation += `| **Protocol** | ${data.protocol} |\n`;
      }

      if (data.pragmaFee) {
        explanation += `| **Pragma Fee** | ${data.pragmaFee.amountFormatted} MON (${data.pragmaFee.percentage}) |\n`;
      }

      if (data.inputDataSize > 0) {
        explanation += `| **Calldata Size** | ${data.inputDataSize.toLocaleString()} bytes |\n`;
      }

      explanation += "\n";

      // Gas Economics section (Monad-specific)
      explanation += formatGasEconomics(data.gasFee);

      // Token movements
      explanation += formatTokenMovements(data);

      // Route info for swaps
      if (data.route && data.route.length > 1) {
        explanation += `**Swap Route:** ${data.route.join(" → ")}\n\n`;
      }

      // UserOp details for ERC-4337 transactions
      if (data.userOp) {
        explanation += formatUserOp(data.userOp);
      }

      // Delegation details for Pragma transactions
      if (data.delegation) {
        explanation += formatDelegation(data.delegation, isPragmaTx);
      }

      // Events summary
      explanation += formatEvents(data.events);

      // Transaction hash and explorer link
      explanation += `\n---\n\n`;
      explanation += `**Transaction Hash:** \`${data.txHash}\`\n\n`;
      explanation += `[🔍 View on MonadVision](https://monadvision.com/tx/${data.txHash})\n`;

      return explanation;
    } catch (error) {
      const err = error as Error;

      if (err.name === "NOT_FOUND" || err.name === "INVALID_PARAMETER") {
        throw error;
      }

      throw createErrorFromCode("RPC_UNAVAILABLE", {
        message: `Failed to explain transaction: ${err.message}`,
        cause: error,
      });
    }
  },
  {
    name: "explainTransaction",
    description:
      `Provide comprehensive blockchain analyst-level analysis of a transaction on Monad.

**Key Context to Explain:**
1. **Block Context**: Block number, position in block (transactionIndex), and sender's nonce
2. **Timing**: When the tx was mined, formatted human-readable
3. **Gas Economics (MONAD-SPECIFIC)**: On Monad, users are charged for gas LIMIT, not gas used. Gas used is informational only. Always explain this difference.
4. **Sender Context**: Nonce shows how many txs this address has sent
5. **Calldata Size**: Indicates transaction complexity

**For Token Approvals:**
- ALWAYS identify the SPENDER (who received approval) from the Approval event
- Look at topics[2] of the Approval event for the spender address
- Explain the security implications of approving tokens

**For Pragma redeemDelegations transactions, ALWAYS create a mermaid flowchart showing:**
1. Smart Account (delegator) creates the delegation with caveats attached
2. Session Key (delegate) carries this signed delegation
3. Session Key calls redeemDelegations() on DelegationManager
4. DelegationManager verifies the delegation chain
5. Each enforcer (caveat) validates its constraints
6. Only after ALL enforcers pass → execution proceeds on target contract

Example mermaid structure:
\`\`\`
graph TD
  SA[Smart Account] -->|creates delegation| DEL[Delegation + Caveats]
  SK[Session Key] -->|carries| DEL
  SK -->|calls redeemDelegations| DM[DelegationManager]
  DM -->|verifies chain| V{Verify}
  V -->|check| E1[TimestampEnforcer ✓]
  V -->|check| E2[NonceEnforcer ✓]
  E1 & E2 -->|all pass| EXEC[Execute Action]
  EXEC -->|on behalf of SA| TARGET[Target Contract]
\`\`\`

After showing the mermaid diagram, explain:
- What each enforcer protects against (replay attacks, time limits, value caps, etc.)
- The decoded parameters for each enforcer
- Security assessment: is this delegation well-protected?

**For ERC-4337 UserOp transactions:**
- Explain the Account Abstraction context
- Identify the smart account (sender) and what operation it's performing
- For session key funding: identify the recipient and amount

Analyze like a blockchain analyst — provide insights, note unusual patterns, and educate the user.`,
    schema: z.object({
      txHash: z
        .string()
        .describe(
          "Transaction hash to explain. Must be full 66-character hex string (0x + 64 chars). Example: '0x1234567890abcdef...'"
        ),
    }),
  }
);
