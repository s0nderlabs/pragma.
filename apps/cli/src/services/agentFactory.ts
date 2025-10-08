import { getAddress } from "viem";

import { PragmaAgent, createOpenAiClarifier, createOpenAiInsight } from "@pragma/core";

import {
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_WMON_ADDRESS,
  MONORAIL_API_KEY,
  MONORAIL_DATA_API_URL,
} from "./config.js";

export const createConfiguredAgent = (): PragmaAgent =>
  new PragmaAgent({
    llmClarifier: createOpenAiClarifier(),
    llmInsight: createOpenAiInsight(),
  });
