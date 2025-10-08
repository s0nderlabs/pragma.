import { Address, Hex, getAddress } from "viem";

export interface MonorailPathfinderConfig {
  appId: string;
  pathfinderUrl: string;
  aggregatorAddress: Address;
  apiKey?: string;
  fetch?: typeof fetch;
}

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

const buildHeaders = (apiKey?: string): Record<string, string> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
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

const getFetchFn = (config: MonorailPathfinderConfig): typeof fetch => config.fetch ?? fetch;

export const fetchMonorailQuote = async (
  params: QuoteRequestParams,
  config: MonorailPathfinderConfig,
): Promise<MonorailQuote> => {
  if (!config.appId) {
    throw new Error("Monorail app id is required to request quotes.");
  }

  const url = new URL(`${config.pathfinderUrl}/quote`);
  url.searchParams.set("source", config.appId);
  url.searchParams.set("from", getAddress(params.fromToken));
  url.searchParams.set("to", getAddress(params.toToken));
  url.searchParams.set("amount", params.amountDecimal);
  url.searchParams.set("sender", getAddress(params.sender));
  url.searchParams.set("destination", getAddress(params.destination ?? params.sender));
  if (params.maxSlippageBps && Number.isFinite(params.maxSlippageBps)) {
    url.searchParams.set("max_slippage", `${params.maxSlippageBps}`);
  }

  const response = await getFetchFn(config)(url.toString(), { headers: buildHeaders(config.apiKey) });
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

  const body = (await response.json()) as RawQuoteResponse;
  if (!body.transaction?.data || !body.quote_id) {
    throw new Error("Monorail quote response missing transaction data.");
  }

  const transactionData = body.transaction.data as Hex;
  const transactionValue = normalizeAmount(body.transaction.value);
  const rawInput = normalizeAmount(body.input);
  const rawOutput = normalizeAmount(body.output);
  const rawMinOutput = normalizeAmount(body.min_output);
  const gasEstimate = typeof body.gas_estimate === "string" || typeof body.gas_estimate === "number"
    ? normalizeAmount(String(body.gas_estimate))
    : undefined;

  const routes = body.routes?.flat().map(parseRoute);
  const fees: QuoteFees | undefined = body.fees
    ? {
        protocolAmount: body.fees.protocol_amount ? normalizeAmount(body.fees.protocol_amount) : undefined,
        protocolBps: body.fees.protocol_bps,
        feeShareAmount: body.fees.fee_share_amount ? normalizeAmount(body.fees.fee_share_amount) : undefined,
        feeShareBps: body.fees.fee_share_bps,
      }
    : undefined;

  return {
    quoteId: body.quote_id,
    transactionData,
    transactionValue,
    aggregator: getAddress(config.aggregatorAddress),
    rawInput,
    rawOutput,
    rawMinOutput,
    gasEstimate,
    inputFormatted: body.input_formatted,
    outputFormatted: body.output_formatted,
    minOutputFormatted: body.min_output_formatted,
    compoundImpact: body.compound_impact,
    optimisation: body.optimisation,
    routes,
    fees,
  };
};
