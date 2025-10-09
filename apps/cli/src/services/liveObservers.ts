import chalk from "chalk";
import { decodeEventLog, formatUnits, getAddress, type Address, type PublicClient, type Hex } from "viem";

import {
  HyperSyncObserver,
  subscribeAggregatorExecutions,
  subscribeDelegationLifecycle,
} from "@pragma/core";

import type { AllowedToken } from "./monorailTokens.js";
import { ENVIO_TOKEN_API, MONAD_HYPERSYNC_URL, MONORAIL_AGGREGATOR_ADDRESS } from "./config.js";

export interface LiveObserverParams {
  delegator: Address;
  sessionKey: Address;
  delegationManager: Address;
  allowedTokens: AllowedToken[];
  publicClient: Pick<PublicClient, "getBlockNumber" | "getTransactionReceipt">;
}

export interface LiveObserverHandle {
  stop: () => Promise<void>;
  isActive: boolean;
}

const shortHash = (hash?: string) => {
  if (!hash || hash.length < 10) return hash ?? "";
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
};

const shouldEnableObservers = () => {
  if (process.env.PRAGMA_DISABLE_HYPERSYNC === "1") return false;
  if (process.env.PRAGMA_REPL_FIXTURE === "1") return false;
  return Boolean(MONAD_HYPERSYNC_URL);
};

const toTokenLookup = (tokens: AllowedToken[]) => {
  const map = new Map<string, AllowedToken>();
  for (const token of tokens) {
    map.set(token.address.toLowerCase(), token);
  }
  return map;
};

const formatTokenAmount = (tokens: Map<string, AllowedToken>, address: Address, value: bigint): string => {
  const token = tokens.get(address.toLowerCase());
  if (!token) {
    return `${value.toString()} ${address.slice(0, 6)}`;
  }
  const decimals = typeof token.decimals === "number" ? token.decimals : 18;
  try {
    const formatted = formatUnits(value, decimals);
    const symbol = token.symbol ?? token.address.slice(0, 6);
    return `${formatted} ${symbol}`;
  } catch {
    const symbol = token.symbol ?? token.address.slice(0, 6);
    return `${value.toString()} ${symbol}`;
  }
};

const toTopicArray = (
  topics: (string | undefined | null)[] | undefined,
): [`0x${string}`, ...`0x${string}`[]] => {
  if (!topics || topics.length === 0 || !topics[0]) {
    throw new Error("Log missing topic0");
  }
  const [first, ...rest] = topics;
  const extras = rest.filter((topic): topic is `0x${string}` => typeof topic === "string");
  return [first as `0x${string}`, ...extras];
};

export const startLiveObservers = async (
  params: LiveObserverParams,
): Promise<LiveObserverHandle | undefined> => {
  if (!shouldEnableObservers()) return undefined;

  const aggregatorAddress = getAddress(MONORAIL_AGGREGATOR_ADDRESS);
  const environmentBlock = await params.publicClient
    .getBlockNumber()
    .then((block) => (block > 12n ? Number(block - 12n) : Number(block)))
    .catch(() => 0);

  const observer = new HyperSyncObserver({
    url: MONAD_HYPERSYNC_URL,
    bearerToken: ENVIO_TOKEN_API,
  });

  const subscriptions: Array<{ close: () => Promise<void> }> = [];
  const tokenLookup = toTokenLookup(params.allowedTokens);

  const reportedTxHashes = new Set<string>();

  try {
    const aggregatorSub = await subscribeAggregatorExecutions(
      {
        observer,
        aggregator: aggregatorAddress,
        delegator: params.delegator,
        fromBlock: environmentBlock,
      },
      (event) => {
        const formattedIn = formatTokenAmount(tokenLookup, event.tokenIn, event.amountIn);
        const formattedOut = formatTokenAmount(tokenLookup, event.tokenOut, event.amountOut);
        const txHash = shortHash(event.transactionHash);
        console.log(
          chalk.gray(
            `[observer] Swap settled ${formattedIn} → ${formattedOut}${txHash ? ` (tx ${txHash})` : ""}.`,
          ),
        );
        if (event.transactionHash) {
          reportedTxHashes.add(event.transactionHash.toLowerCase());
        }
      },
      (error) => {
        console.log(chalk.red(`[observer] Swap stream error: ${error.message}`));
      },
    );
    subscriptions.push({ close: () => aggregatorSub.close() });
  } catch (error) {
    console.log(
      chalk.red(
        `[observer] Failed to subscribe to aggregator events: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  try {
    const delegationSub = await subscribeDelegationLifecycle(
      {
        observer,
        delegationManager: params.delegationManager,
        delegator: params.delegator,
        fromBlock: environmentBlock,
      },
      async (event) => {
        if (event.type === "enabled") {
          console.log(
            chalk.green(
              `[observer] Delegation re-enabled${event.delegate ? ` for ${event.delegate}` : ""}.${
                event.transactionHash ? ` (tx ${shortHash(event.transactionHash)})` : ""
              }`,
            ),
          );
          return;
        }
        if (event.type === "disabled") {
          console.log(
            chalk.yellow(
              `[observer] Delegation disabled${event.delegate ? ` for ${event.delegate}` : ""}.${
                event.transactionHash ? ` (tx ${shortHash(event.transactionHash)})` : ""
              }`,
            ),
          );
          return;
        }
        if (event.transactionHash && !reportedTxHashes.has(event.transactionHash.toLowerCase())) {
          try {
            const receipt = await params.publicClient.getTransactionReceipt({
              hash: event.transactionHash as Hex,
            });
            const aggregatorLog = receipt.logs?.find(
              (log: any) => (log.address ?? "").toLowerCase() === aggregatorAddress.toLowerCase(),
            );
            if (aggregatorLog) {
              const decoded = decodeEventLog({
                abi: [
                  {
                    type: "event",
                    name: "Aggregated",
                    inputs: [
                      { name: "sender", type: "address", indexed: true },
                      { name: "tokenIn", type: "address", indexed: true },
                      { name: "tokenOut", type: "address", indexed: true },
                      { name: "amountIn", type: "uint256", indexed: false },
                      { name: "amountOut", type: "uint256", indexed: false },
                      { name: "protocolFeeAmount", type: "uint256", indexed: false },
                      { name: "referrerFeeAmount", type: "uint256", indexed: false },
                      { name: "referrer", type: "uint64", indexed: false },
                      { name: "quote", type: "uint64", indexed: false },
                    ],
                  },
                ] as const,
                data: (aggregatorLog.data ?? "0x") as Hex,
                topics: toTopicArray(aggregatorLog.topics as (string | undefined | null)[] | undefined),
                strict: false,
              });
              const { tokenIn, tokenOut, amountIn, amountOut } = decoded.args as {
                tokenIn: Address;
                tokenOut: Address;
                amountIn: bigint;
                amountOut: bigint;
              };
              const formattedIn = formatTokenAmount(tokenLookup, tokenIn, amountIn);
              const formattedOut = formatTokenAmount(tokenLookup, tokenOut, amountOut);
              console.log(
                chalk.gray(
                  `[observer] Swap settled ${formattedIn} → ${formattedOut} (tx ${shortHash(
                    event.transactionHash,
                  )}).`,
                ),
              );
              reportedTxHashes.add(event.transactionHash.toLowerCase());
              return;
            }
          } catch (error) {
            console.log(
              chalk.red(
                `[observer] Unable to decode swap for ${shortHash(event.transactionHash)}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              ),
            );
          }
        }
        console.log(
          chalk.gray(
            `[observer] Delegation redeemed${
              event.transactionHash ? ` (tx ${shortHash(event.transactionHash)})` : ""
            }.`,
          ),
        );
      },
      (error) => {
        console.log(chalk.red(`[observer] Delegation stream error: ${error.message}`));
      },
    );
    subscriptions.push({ close: () => delegationSub.close() });
  } catch (error) {
    console.log(
      chalk.red(
        `[observer] Failed to subscribe to delegation events: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  if (subscriptions.length > 0) {
    console.log(
      chalk.gray(`[observer] HyperSync live monitoring enabled (${subscriptions.length} subscriptions).`),
    );
  }

  return {
    isActive: subscriptions.length > 0,
    stop: async () => {
      await Promise.allSettled(subscriptions.map((subscription) => subscription.close()));
    },
  };
};
