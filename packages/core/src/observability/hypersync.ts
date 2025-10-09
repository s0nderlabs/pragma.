import EventEmitter from "node:events";
import type { Address } from "viem";
import {
  HypersyncClient,
  LogField,
  type Log,
  type Query,
  JoinMode,
  type StreamConfig,
} from "@envio-dev/hypersync-client";

export interface HyperSyncConfig {
  url: string;
  bearerToken?: string;
  httpTimeoutMs?: number;
  maxRetries?: number;
}

export interface LogStreamOptions {
  address: Address;
  topics?: (string[] | undefined)[];
  fromBlock?: number;
  toBlock?: number;
  batchSize?: number;
  streamConfig?: StreamConfig;
}

export interface HyperSyncLogPayload {
  logs: Log[];
  nextBlock: number;
  archiveHeight?: number;
}

export type HyperSyncLogEvent =
  | { type: "logs"; payload: HyperSyncLogPayload }
  | { type: "end" }
  | { type: "error"; error: Error };

export class HyperSyncLogSubscription extends EventEmitter {
  #closed = false;
  #close?: () => Promise<void>;

  constructor() {
    super();
  }

  bindCloser(close: () => Promise<void>) {
    this.#close = close;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.emit("close");
    if (this.#close) {
      await this.#close();
    }
  }

  dispatch(event: HyperSyncLogEvent) {
    if (this.#closed) return;
    if (event.type === "logs") {
      this.emit("logs", event.payload);
      return;
    }
    if (event.type === "error") {
      this.emit("error", event.error);
      return;
    }
    if (event.type === "end") {
      this.emit("end");
    }
  }
}

export class HyperSyncObserver {
  #client: HypersyncClient;

  constructor(private readonly config: HyperSyncConfig) {
    this.#client = HypersyncClient.new({
      url: config.url,
      bearerToken: config.bearerToken,
      httpReqTimeoutMillis: config.httpTimeoutMs ?? 20_000,
      maxNumRetries: config.maxRetries ?? 3,
    });
  }

  buildLogQuery(options: LogStreamOptions): Query {
    return {
      fromBlock: options.fromBlock ?? 0,
      toBlock: options.toBlock,
      joinMode: JoinMode.JoinNothing,
      logs: [
        {
          address: [options.address.toLowerCase()],
          topics: options.topics?.map((topicEntries) =>
            topicEntries && topicEntries.length > 0
              ? topicEntries.map((topic) => topic.toLowerCase())
              : [],
          ),
        },
      ],
      fieldSelection: {
        log: [
          LogField.Address,
          LogField.BlockNumber,
          LogField.Data,
          LogField.LogIndex,
          LogField.Topic0,
          LogField.Topic1,
          LogField.Topic2,
          LogField.Topic3,
          LogField.TransactionHash,
          LogField.TransactionIndex,
        ],
      },
    } satisfies Query;
  }

  async subscribeLogs(options: LogStreamOptions): Promise<HyperSyncLogSubscription> {
    const subscription = new HyperSyncLogSubscription();
    let closed = false;
    const query = this.buildLogQuery(options);

    const streamPromise = this.#client
      .stream(query, {
        batchSize: options.batchSize ?? 200,
        ...options.streamConfig,
      })
      .catch((error) => {
        subscription.dispatch({
          type: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        });
        throw error;
      });

    const pump = async () => {
      try {
        const stream = await streamPromise;
        subscription.bindCloser(async () => {
          closed = true;
          await stream.close();
        });
        while (!closed) {
          const response = await stream.recv();
          if (!response) {
            subscription.dispatch({ type: "end" });
            break;
          }
          const logs = response.data?.logs ?? [];
          if (logs.length > 0) {
            subscription.dispatch({
              type: "logs",
              payload: {
                logs,
                nextBlock: response.nextBlock,
                archiveHeight: response.archiveHeight,
              },
            });
          }
        }
      } catch (err) {
        if (closed) return;
        subscription.dispatch({
          type: "error",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    };

    pump();

    return subscription;
  }
}
