import chalk from "chalk";
import open from "open";
import ora from "ora";
import path from "node:path";
import { Address, Hex, http, getAddress, toHex, getFunctionSelector, parseEther, formatEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  createDelegation,
  getDeleGatorEnvironment,
  Implementation,
  signDelegation,
  toMetaMaskSmartAccount,
} from "@metamask/delegation-toolkit";
import type { Caveats } from "@metamask/delegation-toolkit";
import { createBundlerClient } from "viem/account-abstraction";
import { formatUserOperationRequest } from "viem/account-abstraction";
import type { Delegation } from "@metamask/delegation-toolkit";
import inquirer from "inquirer";

import { startWeb3AuthBridge } from "./web3authServer.js";
import { startPrivyBridge } from "./privyBridgeServer.js";
import { createMonadPublicClient, createWalletClientFromBridge, monadChain } from "./web3authClients.js";
import { buildDelegationTypedData } from "./delegationTypedData.js";
import { sponsorUserOperation } from "./pimlico.js";

import { onboardingLogger } from "../utils/logger.js";
import {
  PIMLICO_BUNDLER_URL,
  PIMLICO_CHAIN,
  MONORAIL_AGGREGATOR_ADDRESS,
  PRIVY_APP_ID,
  PRAGMA_IDENTITY_PROVIDER,
  MONAD_CHAIN_ID,
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_WRAPPED_TOKEN_SYMBOL,
  MONAD_NATIVE_TOKEN_ADDRESS,
} from "./config.js";
import {
  loadAllowedTokens,
  normalizeAllowedTokensList,
  hasWrappedNativeToken,
  resolveTokenFromAllowlist,
  formatTokenLabel,
  ensureTokenSet,
} from "./monorailTokens.js";
import type { AllowedToken, TokenKind } from "./monorailTokens.js";
export { normalizeAllowedTokensList, type AllowedToken, type TokenKind } from "./monorailTokens.js";

export type Mode = "safe" | "normal";

export const ROUTER = getAddress(MONORAIL_AGGREGATOR_ADDRESS);
const AGGREGATE_SELECTOR = getFunctionSelector({
  type: "function",
  name: "aggregate",
  stateMutability: "payable",
  inputs: [
    { name: "tokenIn", type: "address" },
    { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "minAmountOut", type: "uint256" },
    { name: "destination", type: "address" },
    { name: "deadline", type: "uint256" },
    { name: "referrer", type: "uint64" },
    { name: "quoteId", type: "uint64" },
    {
      name: "trades",
      type: "tuple[]",
      components: [
        { name: "minAmountOut", type: "uint256" },
        { name: "weight", type: "uint32" },
        { name: "routerType", type: "uint8" },
        { name: "router", type: "address" },
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "params", type: "bytes" },
      ],
    },
  ],
  outputs: [],
}) as Hex;
const APPROVE_SELECTOR = getFunctionSelector({
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [
    { name: "spender", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  outputs: [{ name: "", type: "bool" }],
}) as Hex;
const WRAPPED_DEPOSIT_SELECTOR = getFunctionSelector({
  type: "function",
  name: "deposit",
  stateMutability: "payable",
  inputs: [],
  outputs: [],
}) as Hex;
const WRAPPED_WITHDRAW_SELECTOR = getFunctionSelector({
  type: "function",
  name: "withdraw",
  stateMutability: "nonpayable",
  inputs: [{ name: "wad", type: "uint256" }],
  outputs: [],
}) as Hex;
const ERC20_TRANSFER_SELECTOR = getFunctionSelector({
  type: "function",
  name: "transfer",
  stateMutability: "nonpayable",
  inputs: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
  ],
  outputs: [{ name: "", type: "bool" }],
}) as Hex;
export const ZERO_SALT = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

export const DEFAULT_CALL_LIMITS: Record<Mode, number> = {
  safe: 6,
  normal: 12,
};

const selectSafePairTokens = async (allowlist: AllowedToken[]): Promise<AllowedToken[]> => {
  if (allowlist.length === 0) {
    throw new Error("Monorail allowlist returned no tokens; cannot issue safe delegation.");
  }

  const choices = allowlist.map((token) => ({
    name: formatTokenLabel(token),
    value: token.address,
  }));

  const { selectedAddresses } = await inquirer.prompt<{ selectedAddresses: Address[] }>({
    type: "checkbox",
    name: "selectedAddresses",
    message: "Select exactly two tokens for this delegation",
    choices,
    pageSize: Math.min(choices.length, 15),
    validate: (input: unknown) => (Array.isArray(input) && input.length === 2 ? true : "Select exactly two tokens."),
  });

  const selectedTokens = selectedAddresses
    .map((address) => allowlist.find((token) => token.address === address))
    .filter((token): token is AllowedToken => Boolean(token));

  const normalized = normalizeAllowedTokensList(selectedTokens);
  console.log(
    chalk.cyan(
      "Safe mode delegations are restricted to the selected pair. Reissue in normal mode if you need to add more tokens.",
    ),
  );
  return normalized;
};

const promptAllowlistTokens = async (
  baseTokens: AllowedToken[],
  allowlist: AllowedToken[],
): Promise<AllowedToken[]> => {
  const tokens = normalizeAllowedTokensList(baseTokens);
  const remaining = allowlist.filter(
    (token) => !tokens.some((existing) => existing.address.toLowerCase() === token.address.toLowerCase()),
  );

  if (remaining.length === 0) {
    return tokens;
  }

  const { addAllowlist } = await inquirer.prompt<{ addAllowlist: boolean }>([
    {
      type: "confirm",
      name: "addAllowlist",
      message: "Add additional Monorail allowlist tokens?",
      default: false,
    },
  ]);

  if (!addAllowlist) {
    return tokens;
  }

  const choices = remaining.map((token) => ({
    name: formatTokenLabel(token),
    value: token.address,
  }));

  const { selected } = await inquirer.prompt<{ selected: Address[] }>([
    {
      type: "checkbox",
      name: "selected",
      message: "Select additional allowlist tokens",
      choices,
      pageSize: Math.min(choices.length, 15),
      validate: (input: unknown) => (Array.isArray(input) ? true : "Select at least one token or cancel."),
    },
  ]);

  for (const address of selected) {
    const token = allowlist.find((item) => item.address === address);
    if (token) {
      ensureTokenSet(tokens, token);
    }
  }

  return normalizeAllowedTokensList(tokens);
};

const promptCustomTokens = async (baseTokens: AllowedToken[]): Promise<AllowedToken[]> => {
  const tokens = normalizeAllowedTokensList(baseTokens);
  const publicClient = createMonadPublicClient();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { addCustom } = await inquirer.prompt<{ addCustom: boolean }>([
      {
        type: "confirm",
        name: "addCustom",
        message: "Add a custom token (outside Monorail allowlist)?",
        default: false,
      },
    ]);

    if (!addCustom) break;

    const { tokenAddress } = await inquirer.prompt<{ tokenAddress: string }>([
      {
        type: "input",
        name: "tokenAddress",
        message: "Enter ERC-20 token address:",
      },
    ]);

    let normalizedAddress: Address;
    try {
      normalizedAddress = getAddress(tokenAddress as Address);
    } catch {
      console.log(chalk.red("Invalid address. Try again."));
      continue;
    }

    if (tokens.some((token) => token.address.toLowerCase() === normalizedAddress.toLowerCase())) {
      console.log(chalk.yellow("Token already included in delegation scope."));
      continue;
    }

    try {
      const bytecode = await publicClient.getBytecode({ address: normalizedAddress });
      if (!bytecode || bytecode === "0x") {
        console.log(
          chalk.red("No contract code found at that address. Provide a deployed ERC-20 contract."),
        );
        continue;
      }
    } catch (error) {
      onboardingLogger.debug({ err: error, address: normalizedAddress }, "Bytecode lookup failed");
    }

    let detectedSymbol: string | undefined;
    let detectedDecimals: number | undefined;
    try {
      const [symbolRaw, decimalsRaw] = await Promise.all([
        publicClient.readContract({
          address: normalizedAddress,
          abi: [
            {
              type: "function",
              name: "symbol",
              stateMutability: "view",
              inputs: [],
              outputs: [{ name: "", type: "string" }],
            },
          ] as const,
          functionName: "symbol",
        }) as Promise<string>,
        publicClient.readContract({
          address: normalizedAddress,
          abi: [
            {
              type: "function",
              name: "decimals",
              stateMutability: "view",
              inputs: [],
              outputs: [{ name: "", type: "uint8" }],
            },
          ] as const,
          functionName: "decimals",
        }) as Promise<number>,
      ]);
      detectedSymbol = symbolRaw.trim() || undefined;
      detectedDecimals = Number(decimalsRaw);
    } catch (error) {
      onboardingLogger.debug({ err: error, address: normalizedAddress }, "Failed to auto-detect token metadata");
    }

    let finalSymbol = detectedSymbol;
    if (!finalSymbol) {
      const { symbol } = await inquirer.prompt<{ symbol: string }>([
        {
          type: "input",
          name: "symbol",
          message: "Token symbol (optional):",
        },
      ]);
      finalSymbol = symbol.trim() ? symbol.trim() : undefined;
    }

    let finalDecimals = detectedDecimals;
    if (finalDecimals === undefined || Number.isNaN(finalDecimals)) {
      const { decimalsInput } = await inquirer.prompt<{ decimalsInput: string }>([
        {
          type: "input",
          name: "decimalsInput",
          message: "Token decimals (default 18):",
          default: "18",
        },
      ]);
      const decimalsValue = Number(decimalsInput);
      if (!Number.isInteger(decimalsValue) || decimalsValue < 0 || decimalsValue > 36) {
        console.log(chalk.red("Decimals must be an integer between 0 and 36."));
        continue;
      }
      finalDecimals = decimalsValue;
    }

    const customToken: AllowedToken = {
      address: normalizedAddress,
      symbol: finalSymbol,
      decimals: finalDecimals,
      kind: "erc20",
      categories: ["custom"],
    };

    ensureTokenSet(tokens, customToken);
    console.log(
      chalk.green(
        `Added custom token ${customToken.symbol ?? normalizedAddress} (${normalizedAddress}) with ${finalDecimals} decimals.`,
      ),
    );
  }

  return normalizeAllowedTokensList(tokens);
};

const generateDefaultNormalTokens = (allowlist: AllowedToken[]): AllowedToken[] =>
  normalizeAllowedTokensList(allowlist);

const determineAllowedTokens = async (
  mode: Mode,
  allowlist: AllowedToken[],
  preservedTokens: AllowedToken[],
): Promise<AllowedToken[]> => {
  if (mode === "safe") {
    return selectSafePairTokens(allowlist);
  }

  const allowedAddresses = new Set(allowlist.map((token) => token.address.toLowerCase()));
  const filteredPreserved = preservedTokens.filter((token) => {
    if (token.categories && token.categories.includes("custom")) return true;
    return allowedAddresses.has(token.address.toLowerCase());
  });

  const baseTokens = filteredPreserved.length > 0
    ? normalizeAllowedTokensList(filteredPreserved)
    : generateDefaultNormalTokens(allowlist);
  const withAllowlist = await promptAllowlistTokens(baseTokens, allowlist);
  return promptCustomTokens(withAllowlist);
};

const NONCE_ENFORCER_ABI = [
  {
    type: "function",
    name: "currentNonce",
    stateMutability: "view",
    inputs: [
      { name: "delegationManager", type: "address" },
      { name: "delegator", type: "address" },
    ],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
] as const;

export type DeleGatorEnv = ReturnType<typeof getDeleGatorEnvironment>;

export interface DelegationArtifact {
  mode: Mode;
  sessionKeyPrivateKey: Hex;
  sessionKeyAddress: Address;
  delegation: Delegation;
  expiresAt: number;
  callLimit?: number | null;
  callsUnlimited?: boolean;
  sessionNonce: Hex;
  allowedTokens?: AllowedToken[];
  kind?: "swap" | "transfer";
  transferMaxAmount?: string | null;
}

export interface SessionDelegationInfo {
  mode: Mode;
  sessionKeyAddress: Address;
  sessionKeyPrivateKey: Hex;
  expiresAt: number;
  delegation: Delegation;
  callLimit?: number | null;
  callsUnlimited?: boolean;
  sessionNonce: Hex;
  allowedTokens?: AllowedToken[];
  kind?: "swap" | "transfer";
  transferMaxAmount?: bigint | null;
}

interface HybridTestContext {
  rootPrivateKey: Hex;
  rootAccount: ReturnType<typeof privateKeyToAccount>;
  hybridDelegator: Address;
  environment: ReturnType<typeof getDeleGatorEnvironment>;
  publicClient: ReturnType<typeof createMonadPublicClient>;
  sessionDelegations: SessionDelegationInfo[];
  deploymentInfo?: { userOpHash: Hex; transactionHash: Hex };
}

const TEST_DELEGATIONS_BASE_DIR = (process.env.PRAGMA_DELEGATION_DIR
  ? path.join(process.env.PRAGMA_DELEGATION_DIR)
  : path.join(process.env.HOME ?? ".", ".pragma", "test-delegations"));
const SESSION_KEY_FILENAME = "session-key.json";

export const saveDelegation = async (artifact: DelegationArtifact): Promise<string> => {
  const fs = await import("node:fs/promises");

  const delegatorAddress = getAddress(artifact.delegation.delegator);
  const delegatorDir = path.join(TEST_DELEGATIONS_BASE_DIR, delegatorAddress.toLowerCase());
  await fs.mkdir(delegatorDir, { recursive: true });

  try {
    const existing = await fs.readdir(delegatorDir);
    const historyFiles = existing
      .filter((name) => /^session-\d+\.json$/.test(name))
      .map((name) => ({
        name,
        timestamp: Number(name.match(/^session-(\d+)\.json$/)?.[1] ?? 0),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    const maxHistory = 5;
    while (historyFiles.length >= maxHistory) {
      const oldest = historyFiles.shift();
      if (!oldest) break;
      try {
        await fs.unlink(path.join(delegatorDir, oldest.name));
      } catch (error) {
        onboardingLogger.debug({ err: error, file: oldest.name }, "Failed to prune old delegation artifact");
      }
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      onboardingLogger.debug({ err: error }, "Unable to enumerate existing delegation artifacts");
    }
  }

  const file = path.join(delegatorDir, `session-${Date.now()}.json`);
  const normalizedArtifact: DelegationArtifact = {
    ...artifact,
    allowedTokens: normalizeAllowedTokensList(artifact.allowedTokens ?? []),
    transferMaxAmount: artifact.transferMaxAmount ?? null,
  };
  await fs.writeFile(file, JSON.stringify(normalizedArtifact, null, 2));
  onboardingLogger.info({ file, delegator: delegatorAddress }, "Stored 4337 delegation artifact");
  return file;
};

export const generateSessionKey = (): { privateKey: Hex; address: Address } => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { privateKey, address: account.address };
};

export interface SessionKeyRecord {
  address: Address;
  privateKey: Hex;
  filePath: string;
  isNew: boolean;
}

export const getOrCreateSessionKey = async (delegator: Address): Promise<SessionKeyRecord> => {
  const fs = await import("node:fs/promises");
  const normalizedDelegator = getAddress(delegator);
  const delegatorDir = path.join(TEST_DELEGATIONS_BASE_DIR, normalizedDelegator.toLowerCase());
  await fs.mkdir(delegatorDir, { recursive: true });

  const keyPath = path.join(delegatorDir, SESSION_KEY_FILENAME);
  try {
    const raw = await fs.readFile(keyPath, "utf8");
    const stored = JSON.parse(raw) as {
      sessionKeyPrivateKey?: string;
      sessionKeyAddress?: string;
      privateKey?: string;
      address?: string;
    };
    const storedPrivateKey = (stored.sessionKeyPrivateKey ?? stored.privateKey) as Hex | undefined;
    const storedAddress = stored.sessionKeyAddress ?? stored.address;
    if (storedPrivateKey && storedAddress) {
      const account = privateKeyToAccount(storedPrivateKey);
      const resolvedAddress = getAddress(storedAddress);
      if (account.address.toLowerCase() === resolvedAddress.toLowerCase()) {
        return {
          privateKey: storedPrivateKey,
          address: resolvedAddress,
          filePath: keyPath,
          isNew: false,
        };
      }
      onboardingLogger.warn(
        { resolvedAddress, storedAddress },
        "Persisted session key address mismatch; regenerating",
      );
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      onboardingLogger.warn({ err: error }, "Failed reading persisted session key; regenerating");
    }
  }

  const fresh = generateSessionKey();
  const payload = {
    sessionKeyAddress: fresh.address,
    sessionKeyPrivateKey: fresh.privateKey,
    createdAt: Date.now(),
  };
  await fs.writeFile(keyPath, JSON.stringify(payload, null, 2));
  onboardingLogger.info(
    { file: keyPath, delegator: normalizedDelegator },
    "Persisted new session key for delegator",
  );
  return { ...fresh, filePath: keyPath, isNew: true };
};

const clearPersistedSessionArtifacts = async (delegator: Address) => {
  const fs = await import("node:fs/promises");
  const normalizedDelegator = getAddress(delegator);
  const delegatorDir = path.join(TEST_DELEGATIONS_BASE_DIR, normalizedDelegator.toLowerCase());
  const keyPath = path.join(delegatorDir, SESSION_KEY_FILENAME);

  try {
    await fs.unlink(keyPath);
    onboardingLogger.info({ file: keyPath, delegator: normalizedDelegator }, "Removed persisted session key");
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      onboardingLogger.warn({ err: error, file: keyPath }, "Failed to remove persisted session key");
    }
  }

  try {
    const entries = await fs.readdir(delegatorDir);
    await Promise.all(
      entries
        .filter((name) => /^session-\d+\.json$/.test(name))
        .map(async (name) => {
          try {
            await fs.unlink(path.join(delegatorDir, name));
          } catch (error) {
            onboardingLogger.debug({ err: error, file: name }, "Failed to remove session delegation artifact during rotation");
          }
        }),
    );
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      onboardingLogger.debug({ err: error, delegator: normalizedDelegator }, "Failed to enumerate delegation artifacts during rotation");
    }
  }
};

const NATIVE_TRANSFER_SELECTOR = "0x" as Hex; // placeholder to track native transfer in selectors set

export const buildScope = (allowedTokens: AllowedToken[], delegator?: Address) => {
  const targetSet = new Set<Address>();
  targetSet.add(ROUTER);
  for (const token of allowedTokens) {
    targetSet.add(getAddress(token.address));
  }
  if (delegator) {
    targetSet.add(getAddress(delegator));
  }

  const selectors = new Set<Hex>([AGGREGATE_SELECTOR, APPROVE_SELECTOR, ERC20_TRANSFER_SELECTOR]);
  const hasWrapped = allowedTokens.some((token) => token.kind === "wrappedNative");
  if (hasWrapped) {
    selectors.add(WRAPPED_DEPOSIT_SELECTOR);
    selectors.add(WRAPPED_WITHDRAW_SELECTOR);
  }

  return {
    type: "functionCall" as const,
    targets: Array.from(targetSet),
    selectors: Array.from(selectors),
    allowedCalldata: [],
  };
};

export const fetchDelegatorNonce = async (
  publicClient: ReturnType<typeof createMonadPublicClient>,
  environment: DeleGatorEnv,
  delegator: Address,
): Promise<bigint> => {
  const nonceEnforcerAddress = environment.caveatEnforcers?.NonceEnforcer;
  if (!nonceEnforcerAddress) {
    throw new Error("NonceEnforcer address missing in environment configuration");
  }

  const nonce = (await publicClient.readContract({
    address: nonceEnforcerAddress as Address,
    abi: NONCE_ENFORCER_ABI,
    functionName: "currentNonce",
    args: [environment.DelegationManager as Address, delegator],
  })) as bigint;

  return nonce;
};

export interface CaveatOptions {
  callLimit?: number | null;
  unlimitedCalls?: boolean;
  nonce: bigint;
}

export const buildCaveats = (
  _environment: ReturnType<typeof getDeleGatorEnvironment>,
  mode: Mode,
  expiresAt: number,
  { callLimit, unlimitedCalls, nonce }: CaveatOptions,
) => {
  const baseCaveats = [
    {
      type: "timestamp" as const,
      afterThreshold: 0,
      beforeThreshold: expiresAt,
    },
    {
      type: "nonce" as const,
      nonce: toHex(nonce),
    },
  ] as const;

  const limitedCaveats = !unlimitedCalls
    ? ([
        {
          type: "limitedCalls" as const,
          limit: callLimit ?? DEFAULT_CALL_LIMITS[mode],
        },
      ] as const)
    : ([] as const);

  return [...baseCaveats, ...limitedCaveats] as unknown as Caveats;
};

const submitHybridDelegatorDeployment = async ({
  smartAccount,
  bundlerClient,
  chainId,
  publicClient,
}: {
  smartAccount: Awaited<ReturnType<typeof toMetaMaskSmartAccount>>;
  bundlerClient: ReturnType<typeof createBundlerClient>;
  chainId: number;
  publicClient: ReturnType<typeof createMonadPublicClient>;
}): Promise<{ userOpHash: Hex; transactionHash: Hex }> => {
  const sender = await smartAccount.getAddress();
  const nonce = (await smartAccount.getNonce?.()) ?? 0n;
  const factoryArgs = await smartAccount.getFactoryArgs?.();
  if (!factoryArgs) {
    throw new Error("Unable to fetch factory args for HybridDelegator");
  }

  const feeEstimates = await publicClient.estimateFeesPerGas().catch(() => undefined);
  const gasPrice = await publicClient.getGasPrice();
  let maxPriorityFeePerGas = feeEstimates?.maxPriorityFeePerGas ?? gasPrice;
  let maxFeePerGas = feeEstimates?.maxFeePerGas ?? gasPrice + maxPriorityFeePerGas;

  try {
    const gasPriceSuggestion = (await bundlerClient.request(
      {
        method: "pimlico_getUserOperationGasPrice",
        params: [],
      },
      { retryCount: 0 },
    )) as
      | {
          fast?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
          standard?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
          slow?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
        }
      | undefined;

    const recommended = gasPriceSuggestion?.fast ?? gasPriceSuggestion?.standard ?? gasPriceSuggestion?.slow;
    if (recommended) {
      maxFeePerGas = BigInt(recommended.maxFeePerGas);
      maxPriorityFeePerGas = BigInt(recommended.maxPriorityFeePerGas);
    }
  } catch (error) {
    onboardingLogger.debug({ err: error }, "Failed to fetch Pimlico gas price suggestion");
  }

  const baseUserOp = {
    sender,
    nonce,
    factory: factoryArgs.factory,
    factoryData: factoryArgs.factoryData,
    callData: "0x",
    callGasLimit: 0n,
    verificationGasLimit: 0n,
    preVerificationGas: 0n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    signature: "0x",
  } as any;

  const formattedBase = formatUserOperationRequest(baseUserOp);
  const sponsorship = await sponsorUserOperation({
    userOperation: formattedBase,
    entryPoint: smartAccount.entryPoint.address,
  });

  const userOp = {
    ...baseUserOp,
    callGasLimit: sponsorship.callGasLimit ?? baseUserOp.callGasLimit,
    verificationGasLimit: sponsorship.verificationGasLimit ?? baseUserOp.verificationGasLimit,
    preVerificationGas: sponsorship.preVerificationGas ?? baseUserOp.preVerificationGas,
    paymasterPostOpGasLimit:
      sponsorship.paymasterPostOpGasLimit ?? baseUserOp.paymasterPostOpGasLimit,
    paymasterVerificationGasLimit:
      sponsorship.paymasterVerificationGasLimit ?? baseUserOp.paymasterVerificationGasLimit,
    paymaster:
      sponsorship.paymaster ?? (`0x${sponsorship.paymasterAndData.slice(2, 42)}` as Hex),
    paymasterData:
      sponsorship.paymasterData ?? (`0x${sponsorship.paymasterAndData.slice(42)}` as Hex),
  } as any;

  const signature = await smartAccount.signUserOperation(userOp);
  const rpcUserOperation = formatUserOperationRequest({
    ...userOp,
    signature,
  } as any);

  const userOpHash = (await bundlerClient.request(
    {
      method: "eth_sendUserOperation",
      params: [rpcUserOperation, smartAccount.entryPoint.address],
    },
    { retryCount: 0 },
  )) as Hex;

  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });
  const transactionHash = receipt.receipt?.transactionHash as Hex | undefined;
  if (!transactionHash || transactionHash === "0x") {
    throw new Error("Pimlico bundler response missing transaction hash");
  }

  return { userOpHash, transactionHash };
};

const isSmartAccountDeployed = async ({
  smartAccount,
  publicClient,
  address,
}: {
  smartAccount: Awaited<ReturnType<typeof toMetaMaskSmartAccount>>;
  publicClient: ReturnType<typeof createMonadPublicClient>;
  address: Address;
}): Promise<boolean> => {
  try {
    const reported = await smartAccount.isDeployed?.();
    if (typeof reported === "boolean") {
      return reported;
    }
  } catch (error) {
    onboardingLogger.debug({ err: error }, "smartAccount.isDeployed failed; falling back to bytecode check");
  }

  const bytecode = await publicClient.getBytecode({ address });
  return !!bytecode && bytecode !== "0x";
};

export interface RunOnboardOptions {
  rotateSessionKey?: boolean;
  expectedDelegator?: Address;
  callLimitOverride?: number | null;
  unlimitedCalls?: boolean;
  existingAllowedTokens?: AllowedToken[];
  overrideAllowedTokens?: AllowedToken[];
  createTransferDelegation?: boolean;
  transferAmountWei?: bigint;
}

export const runOnboard4337 = async (
  modeHint?: Mode,
  identityHint?: "privy" | "web3auth",
  options: RunOnboardOptions = {},
) => {
  onboardingLogger.debug({ chain: PIMLICO_CHAIN }, "Using Pimlico bundler & paymaster endpoints");

    const environment = getDeleGatorEnvironment(MONAD_CHAIN_ID);
  let sessionKey!: SessionKeyRecord;
  let expiresAt = 0;
  let hybridDelegator: Address | undefined;
  let mode: Mode;

  const rotateSessionKey = options.rotateSessionKey ?? false;
  const expectedDelegator = options.expectedDelegator ? getAddress(options.expectedDelegator) : undefined;
  const preservedTokens = normalizeAllowedTokensList(options.existingAllowedTokens ?? []);

  const normalizedHint = identityHint;
  const requestedIdentity = PRAGMA_IDENTITY_PROVIDER?.toLowerCase();
  const envIdentity =
    requestedIdentity === "web3auth"
      ? "web3auth"
      : requestedIdentity === "privy"
        ? "privy"
        : undefined;

  const identityProvider: "privy" | "web3auth" = normalizedHint ?? envIdentity ?? "web3auth";

  if (identityProvider === "privy" && !PRIVY_APP_ID) {
    throw new Error(
      "PRIVY_ID environment variable must be set to use the Privy identity provider (set PRAGMA_IDENTITY_PROVIDER=web3auth to force Web3Auth).",
    );
  }

  onboardingLogger.info({ identityProvider, source: normalizedHint ? "cli" : envIdentity ? "env" : "auto" }, "Using wallet identity bridge");

  if (identityProvider === "web3auth" && !normalizedHint && !envIdentity && !PRIVY_APP_ID) {
    onboardingLogger.info("PRIVY_ID not configured; falling back to Web3Auth");
  }

  const bridge =
    identityProvider === "privy"
      ? startPrivyBridge({
          onReady: async (url) => {
            onboardingLogger.info({ url }, "Launching Privy handoff");
            await open(url, { wait: false });
          },
        })
      : startWeb3AuthBridge(async (url) => {
          onboardingLogger.info({ url }, "Launching Web3Auth handoff");
          await open(url, { wait: false });
        });

  try {
    const { address: registeredAddress } = await bridge.waitForWallet();
    const { walletClient, address: derivedAddress } = await createWalletClientFromBridge(
      bridge,
      registeredAddress,
    );
    const rootAddress = derivedAddress;

    onboardingLogger.info(
      { root: rootAddress, reported: registeredAddress, identityProvider },
      "Identity wallet connected",
    );

    const publicClient = createMonadPublicClient();

    const smartAccount = await toMetaMaskSmartAccount({
      client: publicClient,
      implementation: Implementation.Hybrid,
      signer: { walletClient: walletClient as any },
      deployParams: [rootAddress, [], [], []],
      deploySalt: "0x",
    });

    const bundlerClient = createBundlerClient({
      chain: monadChain,
      transport: http(PIMLICO_BUNDLER_URL),
      client: publicClient,
      account: smartAccount,
    } as any);

    hybridDelegator = await smartAccount.getAddress();

    const alreadyDeployed = await isSmartAccountDeployed({
      smartAccount,
      publicClient,
      address: hybridDelegator,
    });

    let existingOwner: Address | undefined;
    if (alreadyDeployed) {
      try {
        existingOwner = (await publicClient.readContract({
          address: hybridDelegator,
          abi: [
            {
              type: "function",
              name: "owner",
              stateMutability: "view",
              inputs: [],
              outputs: [{ name: "owner", type: "address" }],
            },
          ] as const,
          functionName: "owner",
        })) as Address;
      } catch {
        existingOwner = undefined;
      }
    }
    let deploymentInfo: { userOpHash: Hex; transactionHash: Hex } | undefined;

    if (alreadyDeployed) {
      if (existingOwner && existingOwner !== rootAddress) {
        console.log(
          chalk.red(
            `Connected Web3Auth wallet ${rootAddress} is not the owner of HybridDelegator ${hybridDelegator}.`,
          ),
        );
        console.log(
          chalk.yellow(
            `Reconnect with the original owner account (${existingOwner}) or update ownership before issuing a delegation.`,
          ),
        );
        return;
      }
      onboardingLogger.info({ hybridDelegator }, "HybridDelegator already deployed for user");
      const { continueWithExisting } = await inquirer.prompt<{ continueWithExisting: boolean }>([
        {
          type: "confirm",
          name: "continueWithExisting",
          message: `HybridDelegator already deployed at ${hybridDelegator}. Reuse existing account?`,
          default: true,
        },
      ]);

      if (!continueWithExisting) {
        console.log(chalk.yellow("Onboarding cancelled — retaining existing HybridDelegator."));
        return;
      }

      console.log(chalk.green("Reusing previously deployed HybridDelegator."));
    } else {
      const { confirmDeployment } = await inquirer.prompt<{ confirmDeployment: boolean }>([
        {
          type: "confirm",
          name: "confirmDeployment",
          message: `Deploy HybridDelegator smart account for ${rootAddress}?`,
          default: true,
        },
      ]);

      if (!confirmDeployment) {
        console.log(chalk.yellow("Deployment aborted by user."));
        return;
      }

      const ensureDeployedSpinner = ora("Deploying HybridDelegator (Pimlico sponsored)").start();
      try {
        const { userOpHash, transactionHash } = await submitHybridDelegatorDeployment({
          smartAccount,
          bundlerClient,
          chainId: MONAD_CHAIN_ID,
          publicClient,
        });
        onboardingLogger.info({ userOpHash, transactionHash }, "HybridDelegator deployment submitted");
        ensureDeployedSpinner.succeed(
          `HybridDelegator deployed (userOp: ${userOpHash}, tx: ${transactionHash})`,
        );
        deploymentInfo = { userOpHash, transactionHash };
      } catch (error) {
        ensureDeployedSpinner.fail("HybridDelegator deployment failed");
        throw error;
      }
    }

    if (deploymentInfo) {
      console.log(`UserOperation hash: ${deploymentInfo.userOpHash}`);
      console.log(`Transaction hash: ${deploymentInfo.transactionHash}`);
    }

    const normalizedDelegator = getAddress(hybridDelegator as Address);
    if (expectedDelegator && normalizedDelegator !== expectedDelegator) {
      console.log(
        chalk.red(
          `Connected HybridDelegator ${normalizedDelegator} does not match expected delegator ${expectedDelegator}. Aborting.`,
        ),
      );
      return;
    }

    if (rotateSessionKey) {
      await clearPersistedSessionArtifacts(normalizedDelegator);
    }

    sessionKey = await getOrCreateSessionKey(hybridDelegator as Address);
    if (rotateSessionKey && !sessionKey.isNew) {
      throw new Error("Failed to rotate session key; existing key persisted on disk.");
    }
    if (sessionKey.isNew) {
      console.log(
        chalk.green(
          `Created session key ${sessionKey.address}. Fund this address once and it will be reused for future delegations.`,
        ),
      );
    } else {
      console.log(
        chalk.green(
          `Reusing existing session key ${sessionKey.address}. Top-ups carry across new delegations.`,
        ),
      );
    }

    let selectedMode = modeHint;
    if (selectedMode) {
      const { confirmMode } = await inquirer.prompt<{ confirmMode: boolean }>([
        {
          type: "confirm",
          name: "confirmMode",
          message: `Use ${selectedMode} mode for delegation?`,
          default: true,
        },
      ]);
      if (!confirmMode) selectedMode = undefined;
    }

    if (!selectedMode) {
      const { modeChoice } = await inquirer.prompt<{ modeChoice: Mode }>([
        {
          type: "list",
          name: "modeChoice",
          message: "Select delegation mode",
          choices: [
            { name: "Safe (pair scoped, tighter limits)", value: "safe" },
            { name: "Normal (curated list, broader limits)", value: "normal" },
          ],
          default: "safe",
        },
      ]);
      selectedMode = modeChoice;
    }

    mode = selectedMode;
    const ttlSeconds = mode === "safe" ? 3600 : 24 * 3600;

    const before = Math.floor(Date.now() / 1000) + ttlSeconds;
    expiresAt = before;

    const allowlistCatalog = await loadAllowedTokens();
    if (allowlistCatalog.length === 0) {
      throw new Error("Monorail token allowlist is empty. Retry after the data API is reachable.");
    }

    const defaultCallLimit = DEFAULT_CALL_LIMITS[mode];
    let callsUnlimited = options.unlimitedCalls ?? false;
    let callLimitOverride = options.callLimitOverride ?? undefined;

    if (callLimitOverride !== undefined && callLimitOverride !== null) {
      if (Number.isNaN(callLimitOverride) || callLimitOverride <= 0) {
        throw new Error("Call limit override must be a positive number.");
      }
      if (!Number.isInteger(callLimitOverride)) {
        throw new Error("Call limit override must be an integer value.");
      }
    }

    if (options.unlimitedCalls && callLimitOverride !== undefined) {
      throw new Error("Cannot specify both --unlimited-calls and a numeric --calls override.");
    }

    if (!callsUnlimited && callLimitOverride === undefined) {
      const { limitChoice } = await inquirer.prompt<{
        limitChoice: "default" | "custom" | "unlimited";
      }>([
        {
          type: "list",
          name: "limitChoice",
          message: "How many delegated calls should be permitted before expiry?",
          choices: [
            {
              name: `Use default (${defaultCallLimit} calls)` ,
              value: "default",
            },
            {
              name: "Set custom call limit",
              value: "custom",
            },
            {
              name: "Unlimited (disables LimitedCalls enforcer)",
              value: "unlimited",
            },
          ],
          default: "default",
        },
      ]);

      if (limitChoice === "unlimited") {
        callsUnlimited = true;
      } else if (limitChoice === "custom") {
        const { customLimit } = await inquirer.prompt<{ customLimit: string }>([
          {
            type: "input",
            name: "customLimit",
            message: "Enter maximum number of delegated calls",
            default: String(defaultCallLimit),
            validate: (input: string) => {
              const parsed = Number(input);
              if (!Number.isFinite(parsed) || parsed <= 0) {
                return "Provide a positive number.";
              }
              if (!Number.isInteger(parsed)) {
                return "Call limit must be an integer.";
              }
              return true;
            },
          },
        ]);
        const parsedLimit = Number(customLimit);
        callLimitOverride = parsedLimit;
      } else {
        callLimitOverride = defaultCallLimit;
      }
    }

    const resolvedCallLimit = callsUnlimited
      ? undefined
      : callLimitOverride ?? defaultCallLimit;

    const currentNonce = await fetchDelegatorNonce(publicClient, environment, normalizedDelegator);

    const overrideAllowedTokens = options.overrideAllowedTokens
      ? normalizeAllowedTokensList(options.overrideAllowedTokens)
      : undefined;

    let allowedTokens = overrideAllowedTokens
      ? overrideAllowedTokens
      : await determineAllowedTokens(mode, allowlistCatalog, preservedTokens);
    if (allowedTokens.length === 0) {
      ensureTokenSet(allowedTokens, allowlistCatalog[0]);
    }

    const scope = buildScope(allowedTokens);
    const caveats = buildCaveats(environment, mode, before, {
      callLimit: resolvedCallLimit,
      unlimitedCalls: callsUnlimited,
      nonce: currentNonce,
    });

    const delegationWithoutSignature = createDelegation({
      environment,
      scope,
      from: hybridDelegator as Hex,
      to: sessionKey.address as Hex,
      caveats,
      salt: ZERO_SALT,
    });

    const typedData = buildDelegationTypedData(
      delegationWithoutSignature,
      MONAD_CHAIN_ID,
      environment.DelegationManager as Address,
    );

    const signResult = await bridge.signTypedData({
      typedDataJson: JSON.stringify(typedData),
      from: rootAddress,
    });

    if (signResult.recoveredAddress && signResult.recoveredAddress.toLowerCase() !== rootAddress.toLowerCase()) {
      throw new Error(
        `Delegation signature produced by ${signResult.recoveredAddress}, expected owner ${rootAddress}.` +
          " Ensure Web3Auth is connected with the original owner account.",
      );
    }

    const signedDelegation: Delegation = {
      ...delegationWithoutSignature,
      signature: signResult.signature as Hex,
    };

    const sessionNonceHex = toHex(currentNonce);

    await saveDelegation({
      mode,
      sessionKeyPrivateKey: sessionKey.privateKey,
      sessionKeyAddress: sessionKey.address,
      delegation: signedDelegation,
      expiresAt,
      callLimit: callsUnlimited ? null : resolvedCallLimit ?? null,
      callsUnlimited,
      sessionNonce: sessionNonceHex,
      allowedTokens,
      kind: "swap",
      transferMaxAmount: null,
    });

    const expiryIso = new Date(expiresAt * 1000).toISOString();
    const callAllowanceDescription = callsUnlimited
      ? "Unlimited (LimitedCalls disabled)"
      : `${resolvedCallLimit} delegated call${resolvedCallLimit === 1 ? "" : "s"} before expiry`;

    console.log(chalk.green(`Delegation stored for session key ${sessionKey.address}`));
    const selectorSummary = hasWrappedNativeToken(allowedTokens)
      ? "aggregate(...), approve(address,uint256), deposit(), withdraw(uint256)"
      : "aggregate(...), approve(address,uint256)";

    console.log(`  • Purpose         : swap permissions via Monorail aggregator ${ROUTER}`);
    console.log(`  • Allowed selectors: ${selectorSummary}`);
    console.log(`  • Session window  : valid until ${expiryIso}`);
    console.log(`  • Call allowance  : ${callAllowanceDescription}`);
    console.log(`  • Nonce guard      : ${sessionNonceHex} (NonceEnforcer)`);
    if (allowedTokens.length > 0) {
      const labelledTokens = allowedTokens
        .map((token) => (token.symbol ? `${token.symbol} (${token.address})` : token.address))
        .join(", ");
      console.log(`  • Allowed tokens  : ${labelledTokens}`);
    }
    console.log(`  • Session key      : ${sessionKey.address}`);
    console.log(`  • Session secret   : ${sessionKey.privateKey}`);
    console.log(`  • Delegator        : ${signedDelegation.delegator}`);
    console.log("  • Signature        : delegation signed via Web3Auth wallet session\n");

    // Optional native transfer delegation
    const shouldCreateTransferDelegation = options.createTransferDelegation ?? true;
    let transferDelegationInfo: { delegation: Delegation; maxAmount: bigint } | null = null;
    if (shouldCreateTransferDelegation) {
      let transferMax = options.transferAmountWei;
      if (transferMax === undefined) {
        const { transferChoice } = await inquirer.prompt<{ transferChoice: "default" | "custom" | "skip" }>([
          {
            type: "list",
            name: "transferChoice",
            message: "Configure native MON transfer allowance",
            choices: [
              { name: "Default (1 MON)", value: "default" },
              { name: "Custom amount", value: "custom" },
              { name: "Skip native transfer delegation", value: "skip" },
            ],
            default: "default",
          },
        ]);

        if (transferChoice === "default") {
          transferMax = parseEther("1");
        } else if (transferChoice === "custom") {
          const { customAmount } = await inquirer.prompt<{ customAmount: string }>([
            {
              type: "input",
              name: "customAmount",
              message: "Enter maximum native MON transferable (e.g. 0.5)",
              validate: (input: string) => {
                try {
                  const parsed = parseEther(input.trim());
                  return parsed > 0n ? true : "Amount must be greater than zero";
                } catch {
                  return "Enter a valid decimal amount";
                }
              },
            },
          ]);
          transferMax = parseEther(customAmount.trim());
        }

        if (transferChoice === "skip") {
          transferMax = undefined;
        }
      }

      if (transferMax !== undefined && transferMax > 0n) {
        const transferScope = {
          type: "nativeTokenTransferAmount" as const,
          maxAmount: transferMax,
        };
        const transferCaveats: Caveats = [
          {
            type: "timestamp" as const,
            afterThreshold: 0,
            beforeThreshold: expiresAt,
          },
        ];

        const transferDelegationUnsigned = createDelegation({
          environment,
          scope: transferScope,
          from: hybridDelegator as Hex,
          to: sessionKey.address as Hex,
          caveats: transferCaveats,
          salt: ZERO_SALT,
        });

        const transferTypedData = buildDelegationTypedData(
          transferDelegationUnsigned,
          MONAD_CHAIN_ID,
          environment.DelegationManager as Address,
        );

        const transferSignature = await bridge.signTypedData({
          typedDataJson: JSON.stringify(transferTypedData),
          from: rootAddress,
        });

        if (
          transferSignature.recoveredAddress &&
          transferSignature.recoveredAddress.toLowerCase() !== rootAddress.toLowerCase()
        ) {
          throw new Error(
            `Transfer delegation signature produced by ${transferSignature.recoveredAddress}, expected owner ${rootAddress}.`,
          );
        }

        const signedTransferDelegation: Delegation = {
          ...transferDelegationUnsigned,
          signature: transferSignature.signature as Hex,
        };

        await saveDelegation({
          mode,
          sessionKeyPrivateKey: sessionKey.privateKey,
          sessionKeyAddress: sessionKey.address,
          delegation: signedTransferDelegation,
          expiresAt,
          callLimit: null,
          callsUnlimited: true,
          sessionNonce: "0x0",
          allowedTokens: [],
          kind: "transfer",
          transferMaxAmount: transferMax.toString(),
        });

        console.log(
          chalk.green(
            `Transfer delegation stored for session key ${sessionKey.address} (max ${formatEther(transferMax)} MON)`,
          ),
        );
        transferDelegationInfo = { delegation: signedTransferDelegation, maxAmount: transferMax };
      }
    }

    console.log(chalk.green("4337 onboarding flow complete"));
    console.log(`Root wallet: ${rootAddress}`);
    console.log(`HybridDelegator: ${hybridDelegator ?? "unknown"}`);
    console.log(`Session key: ${sessionKey.address}`);
    console.log(`Delegation TTL target: ${expiryIso}`);
  } finally {
    await bridge.shutdown();
  }
};

export const setupHybridDelegatorTest = async (
  modeSelection: "safe" | "normal" | "both",
  { logSessionSummaries = true }: { logSessionSummaries?: boolean } = {},
): Promise<HybridTestContext> => {
  const publicClient = createMonadPublicClient();
  const rootPrivateKey = generatePrivateKey();
  const rootAccount = privateKeyToAccount(rootPrivateKey);

  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    signer: { account: rootAccount },
    deployParams: [rootAccount.address, [], [], []],
    deploySalt: "0x",
  });

  const bundlerClient = createBundlerClient({
    chain: monadChain,
    transport: http(PIMLICO_BUNDLER_URL),
    client: publicClient,
    account: smartAccount,
  } as any);

  const hybridDelegator = await smartAccount.getAddress();

  const spinner = ora("Deploying HybridDelegator on Monad testnet (test)").start();
  let deploymentInfo: { userOpHash: Hex; transactionHash: Hex } | undefined;
  try {
    const deployed = await isSmartAccountDeployed({
      smartAccount,
      publicClient,
      address: hybridDelegator,
    });
    if (!deployed) {
      const { userOpHash, transactionHash } = await submitHybridDelegatorDeployment({
        smartAccount,
        bundlerClient,
        chainId: MONAD_CHAIN_ID,
        publicClient,
      });
      onboardingLogger.info({ userOpHash, transactionHash }, "Test deployment submitted");
      spinner.succeed(
        `HybridDelegator deployed (userOp: ${userOpHash}, tx: ${transactionHash})`,
      );
      deploymentInfo = { userOpHash, transactionHash };
    } else {
      spinner.succeed("HybridDelegator already deployed (test)");
    }
  } catch (error) {
    spinner.fail("HybridDelegator deployment failed (test)");
    throw error;
  }

  const environment = getDeleGatorEnvironment(MONAD_CHAIN_ID);
  const allowlistCatalog = await loadAllowedTokens();
  if (allowlistCatalog.length === 0) {
    throw new Error("Monorail allowlist is empty; test setup cannot proceed.");
  }
  const modes =
    modeSelection === "both" ? (["safe", "normal"] as const) : ([modeSelection] as const);

  const sessionDelegations: SessionDelegationInfo[] = [];

  for (const mode of modes) {
    const ttlSeconds = mode === "safe" ? 3600 : 24 * 3600;
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

    const sessionKey = generateSessionKey();
    const callLimit = DEFAULT_CALL_LIMITS[mode];
    const callsUnlimited = false;
    const currentNonce = await fetchDelegatorNonce(publicClient, environment, hybridDelegator as Address);
    const sessionNonceHex = toHex(currentNonce);

    const allowedTokens: AllowedToken[] = normalizeAllowedTokensList(
      allowlistCatalog.slice(0, mode === "safe" ? 2 : Math.min(allowlistCatalog.length, 4)),
    );

    const scope = buildScope(allowedTokens);
    const caveats = buildCaveats(environment, mode, expiresAt, {
      callLimit,
      unlimitedCalls: callsUnlimited,
      nonce: currentNonce,
    });

    const delegationWithoutSignature = createDelegation({
      environment,
      scope,
      from: hybridDelegator as Hex,
      to: sessionKey.address as Hex,
      caveats,
      salt: ZERO_SALT,
    });

    const { signature: _unusedSignature, ...delegationToSign } = delegationWithoutSignature;
    const signature = await signDelegation({
      privateKey: rootPrivateKey,
      delegation: delegationToSign,
      delegationManager: environment.DelegationManager as Address,
      chainId: MONAD_CHAIN_ID,
    });

    const signedDelegation: Delegation = {
      ...delegationWithoutSignature,
      signature: signature as Hex,
    };

    await saveDelegation({
      mode,
      sessionKeyPrivateKey: sessionKey.privateKey,
      sessionKeyAddress: sessionKey.address,
      delegation: signedDelegation,
      expiresAt,
      callLimit,
      callsUnlimited,
      sessionNonce: sessionNonceHex,
      allowedTokens,
    });

    const delegationInfo: SessionDelegationInfo = {
      mode,
      sessionKeyAddress: sessionKey.address,
      sessionKeyPrivateKey: sessionKey.privateKey,
      expiresAt,
      delegation: signedDelegation,
      callLimit,
      callsUnlimited,
      sessionNonce: sessionNonceHex,
      allowedTokens,
    };
    sessionDelegations.push(delegationInfo);

    if (logSessionSummaries) {
      const expiryIso = new Date(expiresAt * 1000).toISOString();

      console.log(chalk.green(`[${mode}] Delegation ready for session key ${sessionKey.address}`));
      const selectorSummary = hasWrappedNativeToken(allowedTokens)
        ? "aggregate(...), approve(address,uint256), deposit(), withdraw(uint256)"
        : "aggregate(...), approve(address,uint256)";
      console.log(`  • Purpose         : swap permissions via Monorail aggregator ${ROUTER}`);
      console.log(`  • Allowed selectors: ${selectorSummary}`);
      const labelledTokens = allowedTokens
        .map((token) => (token.symbol ? `${token.symbol} (${token.address})` : token.address))
        .join(", ");
      console.log(`  • Allowed tokens  : ${labelledTokens}`);
      console.log(`  • Session window  : valid until ${expiryIso}`);
      console.log(
        `  • Call allowance  : ${callLimit} delegated call${callLimit === 1 ? "" : "s"} before expiry`,
      );
      console.log(`  • Nonce guard      : ${sessionNonceHex} (NonceEnforcer)`);
      console.log(`  • Session key      : ${sessionKey.address}`);
      console.log(`  • Session secret   : ${sessionKey.privateKey}`);
      console.log(`  • Delegator        : ${signedDelegation.delegator}`);
      console.log("  • Signature        : delegation signed with root test signer\n");
    }
  }

  return {
    rootPrivateKey,
    rootAccount,
    hybridDelegator,
    environment,
    publicClient,
    sessionDelegations,
    deploymentInfo,
  };
};

export const runOnboard4337Test = async (
  modeSelection: "safe" | "normal" | "both" = "both",
) => {
  onboardingLogger.info({ chain: PIMLICO_CHAIN }, "Running 4337 onboarding test");

  const context = await setupHybridDelegatorTest(modeSelection, { logSessionSummaries: true });

  console.log(chalk.green("4337 test onboarding complete"));
  console.log(`Root signer: ${context.rootAccount.address}`);
  console.log(`Root private key: ${context.rootPrivateKey}`);
  console.log(`HybridDelegator: ${context.hybridDelegator}`);
  if (context.deploymentInfo) {
    console.log(`UserOperation hash: ${context.deploymentInfo.userOpHash}`);
    console.log(`Transaction hash: ${context.deploymentInfo.transactionHash}`);
  }

  console.log("Delegation explanations printed above. Artifacts are in-memory only for this test run.");
};
