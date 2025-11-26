import { getAddress } from "viem";

import {
  PragmaAgent,
  createOpenAiClarifier,
  createOpenAiInsight,
  createOpenAiInsightStreamer,
} from "@pragma/core";

import {
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_WMON_ADDRESS,
  MONORAIL_DATA_API_URL,
} from "./config.js";

export const createConfiguredAgent = (): PragmaAgent => {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const fixtureMode = process.env.PRAGMA_REPL_FIXTURE === "1";

  const trendingConfig = !fixtureMode
    ? {
        dataApiUrl: MONORAIL_DATA_API_URL,
        tokenMetadata: {
          nativeTokenAddress: getAddress(MONAD_NATIVE_TOKEN_ADDRESS),
          wrappedNativeTokenAddress: getAddress(MONAD_WMON_ADDRESS),
        },
      }
    : undefined;

  const insightOptions = trendingConfig ? { trendingConfig } : {};
  const disableStreaming = process.env.PRAGMA_AGENT_STREAM_INSIGHTS === "0";
  const enableStreaming = hasApiKey && !disableStreaming && !fixtureMode;

  return new PragmaAgent({
    llmClarifier: createOpenAiClarifier(),
    llmInsight: createOpenAiInsight(insightOptions),
    llmInsightStream: enableStreaming ? createOpenAiInsightStreamer(insightOptions) : undefined,
  });
};
