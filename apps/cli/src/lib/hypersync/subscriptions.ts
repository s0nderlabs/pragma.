import {
  decodeEventLog,
  keccak256,
  padHex,
  stringToHex,
  type Address,
  type Hex,
} from "viem";

import { HyperSyncObserver, type HyperSyncLogSubscription } from "./hypersync.js";
import { createErrorFromCode } from "@pragma/core";

const toTopicHash = (signature: string) => keccak256(stringToHex(signature)).toLowerCase();

const AGGREGATED_EVENT_SIGNATURE =
  "Aggregated(address,address,address,uint256,uint256,uint256,uint256,uint64,uint64)";
const ENABLED_EVENT_SIGNATURE =
  "EnabledDelegation(bytes32,address,address,(address,address,address,bytes32,(address,bytes,bytes)[],uint256,bytes))";
const DISABLED_EVENT_SIGNATURE =
  "DisabledDelegation(bytes32,address,address,(address,address,address,bytes32,(address,bytes,bytes)[],uint256,bytes))";
const REDEEMED_EVENT_SIGNATURE =
  "RedeemedDelegation(address,address,(address,address,address,bytes32,(address,bytes,bytes)[],uint256,bytes))";
const TRANSFER_EVENT_SIGNATURE = "Transfer(address,address,uint256)";

const aggregatedTopic = toTopicHash(AGGREGATED_EVENT_SIGNATURE);
const enabledTopic = toTopicHash(ENABLED_EVENT_SIGNATURE);
const disabledTopic = toTopicHash(DISABLED_EVENT_SIGNATURE);
const redeemedTopic = toTopicHash(REDEEMED_EVENT_SIGNATURE);
const transferTopic = toTopicHash(TRANSFER_EVENT_SIGNATURE);

const toTopicArray = (
  topics: Array<string | undefined | null>,
): [`0x${string}`, ...`0x${string}`[]] => {
  const [first, ...rest] = topics;
  if (!first) {
    throw createErrorFromCode("RECEIPT_LOGS_MISSING", {
      message: "HyperSync log is missing topic0",
      context: { module: "observability" },
    });
  }
  const normalizedFirst = first as `0x${string}`;
  const extras = rest.filter((topic): topic is `0x${string}` => typeof topic === "string");
  return [normalizedFirst, ...extras];
};

const aggregatorAbi = [
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
] as const;

const delegationLifecycleAbi = [
  {
    type: "event",
    name: "DisabledDelegation",
    inputs: [
      { name: "delegationHash", type: "bytes32", indexed: true },
      { name: "delegator", type: "address", indexed: true },
      { name: "delegate", type: "address", indexed: true },
      { name: "delegation", type: "tuple", components: [
        { name: "delegator", type: "address" },
        { name: "delegate", type: "address" },
        { name: "authority", type: "bytes32" },
        {
          name: "caveats",
          type: "tuple[]",
          components: [
            { name: "enforcer", type: "address" },
            { name: "terms", type: "bytes" },
            { name: "args", type: "bytes" },
          ],
        },
        { name: "salt", type: "uint256" },
        { name: "signature", type: "bytes" },
      ], indexed: false },
    ],
  },
  {
    type: "event",
    name: "EnabledDelegation",
    inputs: [
      { name: "delegationHash", type: "bytes32", indexed: true },
      { name: "delegator", type: "address", indexed: true },
      { name: "delegate", type: "address", indexed: true },
      { name: "delegation", type: "tuple", components: [
        { name: "delegator", type: "address" },
        { name: "delegate", type: "address" },
        { name: "authority", type: "bytes32" },
        {
          name: "caveats",
          type: "tuple[]",
          components: [
            { name: "enforcer", type: "address" },
            { name: "terms", type: "bytes" },
            { name: "args", type: "bytes" },
          ],
        },
        { name: "salt", type: "uint256" },
        { name: "signature", type: "bytes" },
      ], indexed: false },
    ],
  },
  {
    type: "event",
    name: "RedeemedDelegation",
    inputs: [
      { name: "rootDelegator", type: "address", indexed: true },
      { name: "redeemer", type: "address", indexed: true },
      {
        name: "delegation",
        type: "tuple",
        components: [
          { name: "delegator", type: "address" },
          { name: "delegate", type: "address" },
          { name: "authority", type: "bytes32" },
          {
            name: "caveats",
            type: "tuple[]",
            components: [
              { name: "enforcer", type: "address" },
              { name: "terms", type: "bytes" },
              { name: "args", type: "bytes" },
            ],
          },
          { name: "salt", type: "uint256" },
          { name: "signature", type: "bytes" },
        ],
        indexed: false,
      },
    ],
  },
] as const;

const transferAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

const padTopicAddress = (address: Address) => padHex(address, { size: 32 }).toLowerCase();

export interface AggregatorSubscriptionParams {
  observer: HyperSyncObserver;
  aggregator: Address;
  delegator?: Address;
  fromBlock?: number;
}

export const subscribeAggregatorExecutions = async (
  params: AggregatorSubscriptionParams,
  onEvent: (event: {
    amountIn: bigint;
    amountOut: bigint;
    tokenIn: Address;
    tokenOut: Address;
    sender: Address;
    transactionHash?: Hex;
    blockNumber?: number;
  }) => void,
  onError?: (error: Error) => void,
): Promise<HyperSyncLogSubscription> => {
  const topics: (string[] | undefined)[] = [[aggregatedTopic]];
  if (params.delegator) {
    topics[1] = [padTopicAddress(params.delegator)];
  }

  const subscription = await params.observer.subscribeLogs({
    address: params.aggregator,
    topics,
    fromBlock: params.fromBlock,
  });

  subscription.on("logs", ({ logs }) => {
    for (const log of logs) {
      const topic0 = log.topics?.[0]?.toLowerCase();
      if (topic0 !== aggregatedTopic) continue;
      try {
        const decoded = decodeEventLog({
          abi: aggregatorAbi,
          eventName: "Aggregated",
          topics: toTopicArray(log.topics ?? []),
          data: (log.data ?? "0x") as `0x${string}`,
          strict: false,
        });
        const { sender, tokenIn, tokenOut, amountIn, amountOut } = decoded.args as {
          sender: Address;
          tokenIn: Address;
          tokenOut: Address;
          amountIn: bigint;
          amountOut: bigint;
        };
        onEvent({
          sender,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          transactionHash: (log.transactionHash ?? undefined) as Hex | undefined,
          blockNumber: log.blockNumber,
        });
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }
  });

  if (onError) {
    subscription.on("error", onError);
  }

  return subscription;
};

export interface DelegationLifecycleSubscriptionParams {
  observer: HyperSyncObserver;
  delegationManager: Address;
  delegator: Address;
  fromBlock?: number;
}

export const subscribeDelegationLifecycle = async (
  params: DelegationLifecycleSubscriptionParams,
  onEvent: (event: { type: "enabled" | "disabled" | "redeemed"; delegate?: Address; transactionHash?: Hex }) => void,
  onError?: (error: Error) => void,
): Promise<HyperSyncLogSubscription> => {
  const topics: (string[] | undefined)[] = [[enabledTopic, disabledTopic, redeemedTopic], [padTopicAddress(params.delegator)]];

  const subscription = await params.observer.subscribeLogs({
    address: params.delegationManager,
    topics,
    fromBlock: params.fromBlock,
  });

  subscription.on("logs", ({ logs }) => {
    for (const log of logs) {
      const topic0 = log.topics?.[0]?.toLowerCase();
      if (!topic0) continue;

      try {
        if (topic0 === enabledTopic) {
          const decoded = decodeEventLog({
            abi: delegationLifecycleAbi,
            eventName: "EnabledDelegation",
            topics: toTopicArray(log.topics ?? []),
            data: (log.data ?? "0x") as `0x${string}`,
            strict: false,
          });
          onEvent({
            type: "enabled",
            delegate: (decoded.args as { delegate: Address }).delegate,
            transactionHash: (log.transactionHash ?? undefined) as Hex | undefined,
          });
          continue;
        }
        if (topic0 === disabledTopic) {
          const decoded = decodeEventLog({
            abi: delegationLifecycleAbi,
            eventName: "DisabledDelegation",
            topics: toTopicArray(log.topics ?? []),
            data: (log.data ?? "0x") as `0x${string}`,
            strict: false,
          });
          onEvent({
            type: "disabled",
            delegate: (decoded.args as { delegate: Address }).delegate,
            transactionHash: (log.transactionHash ?? undefined) as Hex | undefined,
          });
          continue;
        }
        if (topic0 === redeemedTopic) {
          onEvent({
            type: "redeemed",
            transactionHash: (log.transactionHash ?? undefined) as Hex | undefined,
          });
        }
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }
  });

  if (onError) {
    subscription.on("error", onError);
  }

  return subscription;
};

export interface TokenTransferSubscriptionParams {
  observer: HyperSyncObserver;
  token: Address;
  watchedAddresses: Address[];
  fromBlock?: number;
}

export const subscribeTokenTransfers = async (
  params: TokenTransferSubscriptionParams,
  onEvent: (event: {
    from?: Address;
    to?: Address;
    value: bigint;
    transactionHash?: Hex;
  }) => void,
  onError?: (error: Error) => void,
): Promise<HyperSyncLogSubscription> => {
  const subscription = await params.observer.subscribeLogs({
    address: params.token,
    topics: [[transferTopic]],
    fromBlock: params.fromBlock,
  });

  const watchedTopics = params.watchedAddresses.map((address) => padTopicAddress(address));

  subscription.on("logs", ({ logs }) => {
    for (const log of logs) {
      const topic0 = log.topics?.[0]?.toLowerCase();
      if (topic0 !== transferTopic) continue;

      const topics = (log.topics ?? []).filter(
        (topic: string | undefined | null): topic is string => typeof topic === "string",
      );
      const shouldReport = topics
        .slice(1, 3)
        .some((topic: string) => watchedTopics.includes(topic.toLowerCase()));
      if (!shouldReport) continue;

      try {
        const decoded = decodeEventLog({
          abi: transferAbi,
          eventName: "Transfer",
          topics: toTopicArray(log.topics ?? []),
          data: (log.data ?? "0x") as `0x${string}`,
          strict: false,
        });
        const { from, to, value } = decoded.args as { from: Address; to: Address; value: bigint };
        onEvent({
          from,
          to,
          value,
          transactionHash: (log.transactionHash ?? undefined) as Hex | undefined,
        });
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }
  });

  if (onError) {
    subscription.on("error", onError);
  }

  return subscription;
};
