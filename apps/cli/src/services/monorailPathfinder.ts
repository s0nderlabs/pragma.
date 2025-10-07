import { Address, Hex, getAddress } from "viem";

import {
  MONORAIL_APP_ID,
  MONORAIL_API_KEY,
  MONORAIL_PATHFINDER_URL,
  MONORAIL_AGGREGATOR_ADDRESS,
} from "./config.js";

interface RawQuoteTransaction {
  to?: string;
  data?: string;
  value?: string;
}

interface RawQuoteResponse {
  quote_id?: string;
  transaction?: RawQuoteTransaction;
  input?: string;
  output?: string;
  min_output?: string;
  gas_estimate?: string | number;
  generated_at?: number;
  from?: string;
  to?: string;
  compound_impact?: string;
  optimisation?: string;
  min_output_formatted?: string;
  output_formatted?: string;
  input_formatted?: string;
  routes?: RawRoute[][];
  fees?: RawFees;
}

interface RawFees {
  protocol_amount?: string;
  protocol_bps?: number;
  fee_share_amount?: string;
  fee_share_bps?: number;
}

interface RawRoute {
  from?: string;
  from_symbol?: string;
  to?: string;
  to_symbol?: string;
  weighted_price_impact?: string;
  splits?: RawSplit[];
}

interface RawSplit {
  protocol?: string;
  percentage?: string;
  price_impact?: string;
  fee?: string;
}

export interface MonorailQuote {
  quoteId: string;
  transactionData: Hex;
  transactionValue: bigint;
  aggregator: Address;
  rawInput: bigint;
  rawOutput: bigint;
  rawMinOutput: bigint;
  gasEstimate?: bigint;
  inputFormatted?: string;
  outputFormatted?: string;
  minOutputFormatted?: string;
  compoundImpact?: string;
  optimisation?: string;
  routes?: RouteSummary[];
  fees?: QuoteFees;
}

export interface QuoteRequestParams {
  fromToken: Address;
  toToken: Address;
  amountDecimal: string;
  sender: Address;
  destination?: Address;
  maxSlippageBps?: number;
}

export class PathfinderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const buildHeaders = () => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (MONORAIL_API_KEY) {
    headers["x-api-key"] = MONORAIL_API_KEY;
  }
  return headers;
};

const normalizeAmount = (value?: string): bigint => {
  if (!value) return 0n;
  try {
    const trimmed = value.trim();
    if (trimmed.startsWith("0x")) {
      return BigInt(trimmed);
    }
    return BigInt(trimmed);
  } catch (error) {
    throw new Error(`Unable to parse amount '${value}': ${(error as Error).message}`);
  }
};

export interface QuoteFees {
  protocolAmount?: bigint;
  protocolBps?: number;
  feeShareAmount?: bigint;
  feeShareBps?: number;
}

export interface RouteSplitSummary {
  protocol?: string;
  percentage?: number;
  priceImpact?: string;
  feeBps?: number;
}

export interface RouteSummary {
  from?: Address;
  to?: Address;
  fromSymbol?: string;
  toSymbol?: string;
  weightedPriceImpact?: string;
  splits?: RouteSplitSummary[];
}

const parseRoute = (route: RawRoute): RouteSummary => {
  const splits: RouteSplitSummary[] | undefined = route.splits?.map((split) => {
    let percentage: number | undefined;
    if (split.percentage) {
      const parsed = Number(split.percentage);
      percentage = Number.isFinite(parsed) ? parsed : undefined;
    }
    let feeBps: number | undefined;
    if (split.fee) {
      const parsedFee = Number(split.fee);
      feeBps = Number.isFinite(parsedFee) ? parsedFee : undefined;
    }
    return {
      protocol: split.protocol,
      percentage,
      priceImpact: split.price_impact,
      feeBps,
    };
  });

  return {
    from: route.from ? getAddress(route.from as Address) : undefined,
    to: route.to ? getAddress(route.to as Address) : undefined,
    fromSymbol: route.from_symbol,
    toSymbol: route.to_symbol,
    weightedPriceImpact: route.weighted_price_impact,
    splits,
  };
};

export const fetchMonorailQuote = async ({
  fromToken,
  toToken,
  amountDecimal,
  sender,
  destination,
  maxSlippageBps,
}: QuoteRequestParams): Promise<MonorailQuote> => {
  if (!MONORAIL_APP_ID) {
    throw new Error("MONORAIL_APP_ID is required to request quotes. Set it in the environment before swapping.");
  }

  const url = new URL(`${MONORAIL_PATHFINDER_URL}/quote`);
  url.searchParams.set("source", MONORAIL_APP_ID);
  url.searchParams.set("from", getAddress(fromToken));
  url.searchParams.set("to", getAddress(toToken));
  url.searchParams.set("amount", amountDecimal);
  url.searchParams.set("sender", getAddress(sender));
  url.searchParams.set("destination", getAddress(destination ?? sender));
  if (maxSlippageBps && Number.isFinite(maxSlippageBps)) {
    url.searchParams.set("max_slippage", `${maxSlippageBps}`);
  }

  const response = await fetch(url.toString(), { headers: buildHeaders() });
  if (!response.ok) {
    let details = "";
    try {
      const body = await response.json();
      details = typeof body?.message === "string" ? body.message : JSON.stringify(body);
    } catch {
      details = await response.text();
    }
    throw new PathfinderError(
      `Monorail quote request failed (${response.status} ${response.statusText}): ${details}`.trim(),
      response.status,
    );
  }

  const payload = (await response.json()) as RawQuoteResponse;
  if (!payload.quote_id) {
    throw new Error("Monorail quote response missing quote_id");
  }
  if (!payload.transaction?.data) {
    throw new Error("Monorail quote response missing transaction data");
  }

  const aggregator = getAddress(payload.transaction.to ?? MONORAIL_AGGREGATOR_ADDRESS);
  const expectedAggregator = getAddress(MONORAIL_AGGREGATOR_ADDRESS);
  if (aggregator.toLowerCase() !== expectedAggregator.toLowerCase()) {
    throw new Error(
      `Quote transaction targets ${aggregator}, expected configured aggregator ${expectedAggregator}. Check environment variables.`,
    );
  }

  const transactionData = payload.transaction.data as Hex;
  const transactionValue = normalizeAmount(payload.transaction.value ?? "0");
  const rawInput = normalizeAmount(payload.input);
  const rawOutput = normalizeAmount(payload.output);
  const rawMinOutput = normalizeAmount(payload.min_output);
  const gasEstimate = payload.gas_estimate !== undefined ? normalizeAmount(String(payload.gas_estimate)) : undefined;
  const routes = payload.routes
    ? payload.routes.flatMap((routeGroup) => routeGroup.map(parseRoute))
    : undefined;

  const fees: QuoteFees | undefined = payload.fees
    ? {
        protocolAmount: normalizeAmount(payload.fees.protocol_amount),
        protocolBps: payload.fees.protocol_bps ?? undefined,
        feeShareAmount: normalizeAmount(payload.fees.fee_share_amount),
        feeShareBps: payload.fees.fee_share_bps ?? undefined,
      }
    : undefined;

  return {
    quoteId: payload.quote_id,
    transactionData,
    transactionValue,
    aggregator,
    rawInput,
    rawOutput,
    rawMinOutput,
    gasEstimate,
    inputFormatted: payload.input_formatted,
    outputFormatted: payload.output_formatted,
    minOutputFormatted: payload.min_output_formatted,
    compoundImpact: payload.compound_impact,
    optimisation: payload.optimisation,
    routes,
    fees,
  };
};
