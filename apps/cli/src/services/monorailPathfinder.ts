import { Address } from "viem";

import {
  fetchMonorailQuote as fetchMonorailQuoteCore,
  type MonorailQuote,
  type MonorailPathfinderConfig,
  PathfinderError,
  type QuoteFees,
  type QuoteRequestParams,
  type RouteSplitSummary,
  type RouteSummary,
} from "@pragma/core";

import {
  MONORAIL_AGGREGATOR_ADDRESS,
  MONORAIL_APP_ID,
  MONORAIL_PATHFINDER_URL,
} from "./config.js";

const CONFIG: MonorailPathfinderConfig = {
  appId: MONORAIL_APP_ID ?? "",
  pathfinderUrl: MONORAIL_PATHFINDER_URL,
  aggregatorAddress: MONORAIL_AGGREGATOR_ADDRESS as Address,
};

export type { MonorailQuote, QuoteFees, RouteSplitSummary, RouteSummary, PathfinderError };

export const fetchMonorailQuote = async (params: QuoteRequestParams): Promise<MonorailQuote> =>
  fetchMonorailQuoteCore(params, CONFIG);
