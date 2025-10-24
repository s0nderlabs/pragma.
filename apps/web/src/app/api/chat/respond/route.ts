import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getAddress, type Address, type Hex } from "viem";
import { PragmaAgent } from "@pragma/core/agent/pragmaAgent";
import {
  createOpenAiClarifier,
  createOpenAiInsight,
  createOpenAiInsightStreamer,
} from "@pragma/core/agent/openai";
import { buildDelegationContext } from "@pragma/core/agent/context";
import type {
  AgentContext,
  AgentResponse,
  AgentStreamingInsightResult,
} from "@pragma/core/agent/types";
import type { AgentInsightResult } from "@pragma/core/agent/types";
import {
  buildBalancesInsight,
  buildDelegationInsight,
  buildTrendingTokensInsight,
} from "@pragma/core/agent/tools";
import {
  detectQuickAction,
  buildHelpInsight,
  buildAboutInsight,
  buildBuildersInsight,
  buildQuickModeStatusInsight,
  buildQuickModeToggleInsight,
  type QuickAction,
} from "@pragma/core/agent/quickActions";
import { createReadOnlyPublicClient } from "@pragma/core/clients/publicClient";
import type { DelegationArtifact, SessionDelegationInfo } from "@pragma/core/delegations/types";
import type { AllowedToken } from "@pragma/core/monorail/tokens";

const monadChain = {
  id: MONAD_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: MONAD_NATIVE_TOKEN_SYMBOL ?? "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [MONAD_RPC_URL] },
    public: { http: [MONAD_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://testnet.monadexplorer.com",
    },
  },
} as const;

const isFixtureMode = (): boolean =>
  process.env.NEXT_PUBLIC_PRAGMA_FIXTURE_MODE === "1" || process.env.PRAGMA_REPL_FIXTURE === "1";

const getFixtureDir = (): string | undefined => {
  const dir = process.env.PRAGMA_FIXTURE_DIR;
  return dir ? path.resolve(dir) : undefined;
};

const loadFixtureJson = async <T = unknown>(name: string): Promise<T | undefined> => {
  const dir = getFixtureDir();
  if (!dir) return undefined;
  const filePath = path.join(dir, `${name}.json`);
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return JSON.parse(contents) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

interface FixtureInsightDataset {
  walletBalances?: Record<string, unknown>;
  portfolioValues?: Record<string, unknown>;
  tokens?: unknown[];
  trendingTokens?: unknown[];
}

const buildFixtureFetch = (dataset: FixtureInsightDataset | undefined): typeof fetch => {
  const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  const toUrlString = (input: RequestInfo | URL): string => {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    if (typeof input === "object" && input !== null && "url" in input) {
      const candidate = (input as { url?: unknown }).url;
      if (typeof candidate === "string") return candidate;
    }
    return String(input);
  };

  const sanitizeAddress = (value: string | undefined) => value?.toLowerCase() ?? "";

  return async (input: RequestInfo | URL) => {
    const parsed = new URL(toUrlString(input));
    const pathname = parsed.pathname.toLowerCase();

    const walletMatch = pathname.match(/\/wallet\/(0x[0-9a-f]{40})\/balances/);
    if (walletMatch) {
      const address = sanitizeAddress(walletMatch[1]);
      const balances = dataset?.walletBalances?.[address] ?? [];
      return response(balances);
    }

    const portfolioMatch = pathname.match(/\/portfolio\/(0x[0-9a-f]{40})\/value/);
    if (portfolioMatch) {
      const address = sanitizeAddress(portfolioMatch[1]);
      const portfolio = dataset?.portfolioValues?.[address] ?? { value: "0" };
      return response(portfolio);
    }

    if (pathname.endsWith("/tokens/category/verified")) {
      const tokens = dataset?.trendingTokens ?? dataset?.tokens ?? [];
      return response(tokens);
    }

    if (pathname.endsWith("/tokens")) {
      const tokens = dataset?.tokens ?? [];
      return response(tokens);
    }

    return response({ message: "fixture endpoint not implemented" }, 404);
  };
};

interface QuickActionContext {
  session: SessionDelegationInfo;
  artifact: DelegationArtifact;
  delegationContext: ReturnType<typeof buildDelegationContext>;
}

const textEncoder = new TextEncoder();

const parseError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
};

const createSseResponse = (
  execute: (send: (payload: unknown) => void) => Promise<void> | void,
): Response => {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(textEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        await execute(send);
      } catch (error) {
        send({ type: "error", message: parseError(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      Connection: "keep-alive",
    },
  });
};

const streamPlainInsight = (
  insight: AgentInsightResult,
  controls?: Array<{ type: string; payload: unknown }>,
): Response =>
  createSseResponse((send) => {
    controls?.forEach((control) => {
      send({ type: "control", control });
    });
    const lines = [`${insight.title}`.trim(), "", ...insight.body.split(/\r?\n/)].filter((line, index) =>
      index === 0 ? line.length > 0 : true,
    );
    for (const line of lines) {
      const content = line.length > 0 ? `${line}\n` : "\n";
      send({ type: "chunk", content });
    }
    send({ type: "done" });
  });

const buildAgentContext = (ctx: QuickActionContext): AgentContext => ({
  delegation: ctx.delegationContext,
  metadata: {
    delegator: getAddress(ctx.artifact.delegation.delegator as Address),
    sessionKey: ctx.session.sessionKeyAddress,
    mode: ctx.delegationContext.mode,
  },
});

const fetchBalancesQuick = async (
  ctx: QuickActionContext,
  allowedTokens: AllowedToken[],
): Promise<AgentInsightResult> => {
  const delegator = getAddress(ctx.artifact.delegation.delegator as Address);
  const dataset = isFixtureMode() ? await loadFixtureJson<FixtureInsightDataset>("insights") : undefined;
  const fetchImpl = isFixtureMode() ? buildFixtureFetch(dataset) : undefined;
  const publicClient = isFixtureMode()
    ? undefined
    : createReadOnlyPublicClient({
        chain: monadChain,
        readUrl: MONAD_READ_RPC_URL,
        fallbackUrl: MONAD_RPC_URL,
      });

  return buildBalancesInsight({
    delegator,
    sessionKey: ctx.session.sessionKeyAddress,
    mode: ctx.session.mode,
    nativeTokenAddress: getAddress(MONAD_NATIVE_TOKEN_ADDRESS),
    nativeTokenSymbol: MONAD_NATIVE_TOKEN_SYMBOL,
    dataApiUrl: MONORAIL_DATA_API_URL,
    apiKey: MONORAIL_API_KEY,
    allowedTokens,
    publicClient,
    fetch: fetchImpl,
  });
};

const fetchDelegationQuick = (ctx: QuickActionContext): AgentInsightResult =>
  buildDelegationInsight(buildAgentContext(ctx));

const fetchTrendingQuick = async (): Promise<AgentInsightResult> => {
  const dataset = isFixtureMode() ? await loadFixtureJson<FixtureInsightDataset>("insights") : undefined;
  return buildTrendingTokensInsight({
    dataApiUrl: MONORAIL_DATA_API_URL,
    apiKey: MONORAIL_API_KEY,
    tokenMetadata: {
      nativeTokenAddress: getAddress(MONAD_NATIVE_TOKEN_ADDRESS),
      wrappedNativeTokenAddress: getAddress(MONAD_WMON_ADDRESS),
    },
    fetch: dataset ? buildFixtureFetch(dataset) : undefined,
    limit: 10,
  });
};

const buildStatusInsight = async (ctx: QuickActionContext, allowedTokens: AllowedToken[]): Promise<AgentInsightResult> => {
  const balances = await fetchBalancesQuick(ctx, allowedTokens);
  const delegation = fetchDelegationQuick(ctx);
  const body = [`${balances.body}`.trim(), "", `${delegation.body}`.trim()].join("\n\n").trim();
  return {
    type: "insight",
    title: "Delegation status",
    body,
  } satisfies AgentInsightResult;
};

const handleQuickAction = async (
  action: QuickAction,
  ctx: QuickActionContext,
  allowedTokens: AllowedToken[],
  quickModeEnabled: boolean,
): Promise<Response | undefined> => {
  const tokens = allowedTokens.length > 0 ? allowedTokens : ctx.session.allowedTokens ?? [];
  switch (action.type) {
    case "balances": {
      const insight = await fetchBalancesQuick(ctx, tokens);
      return streamPlainInsight(insight);
    }
    case "delegation": {
      const insight = fetchDelegationQuick(ctx);
      return streamPlainInsight(insight);
    }
    case "status": {
      const insight = await buildStatusInsight(ctx, tokens);
      return streamPlainInsight(insight);
    }
    case "trending": {
      const insight = await fetchTrendingQuick();
      return streamPlainInsight(insight);
    }
    case "help": {
      return streamPlainInsight(buildHelpInsight());
    }
    case "about": {
      return streamPlainInsight(buildAboutInsight());
    }
    case "builders": {
      return streamPlainInsight(buildBuildersInsight());
    }
    case "quick": {
      if (!ctx.session) {
        return streamPlainInsight(buildQuickModeStatusInsight(quickModeEnabled));
      }

      const { command } = action as Extract<QuickAction, { type: "quick" }>;

      if (command === "status") {
        return streamPlainInsight(buildQuickModeStatusInsight(quickModeEnabled));
      }

      const nextEnabled = command === "toggle"
        ? !quickModeEnabled
        : command === "enable"
          ? true
          : false;

      return streamPlainInsight(buildQuickModeToggleInsight(nextEnabled), [
        { type: "quick_mode", payload: { enabled: nextEnabled } },
      ]);
    }
    case "revoke": {
      return streamPlainInsight({
        type: "insight",
        title: "Revoke delegation",
        body: "Delegation revocation requires wallet confirmation via the Connected account modal or CLI. Please open the modal and use the revoke option, or run `pragma revoke` in the CLI.",
      });
    }
    case "logout": {
      return streamPlainInsight({
        type: "insight",
        title: "Logout",
        body: "To disconnect, open the Connected account menu and choose Disconnect. This clears your local delegation artifacts and session keys.",
      });
    }
    default:
      return undefined;
  }
};

import {
  MONAD_CHAIN_ID,
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_RPC_URL,
  MONAD_READ_RPC_URL,
  MONAD_WRAPPED_TOKEN_SYMBOL,
  MONAD_WMON_ADDRESS,
  MONORAIL_DATA_API_URL,
  MONORAIL_API_KEY,
  PRAGMA_AGENT_STREAM_INSIGHTS,
} from "../../../../lib/config";

interface AgentRequestBody {
  message?: unknown;
  delegation?: {
    artifact?: DelegationArtifact;
    tokens?: AllowedToken[];
  };
  quickMode?: unknown;
}

const toSessionDelegation = (artifact: DelegationArtifact): SessionDelegationInfo => {
  const perTokenCaps = artifact.perTokenCapsWei
    ? Object.fromEntries(
        Object.entries(artifact.perTokenCapsWei).map(([address, amount]) => [
          getAddress(address as Address).toLowerCase(),
          BigInt(amount),
        ]),
      )
    : undefined;

  const nativeCap =
    artifact.nativeTokenCapWei !== undefined && artifact.nativeTokenCapWei !== null
      ? BigInt(artifact.nativeTokenCapWei)
      : undefined;

  return {
    mode: artifact.mode,
    sessionKeyAddress: getAddress(artifact.sessionKeyAddress),
    sessionKeyPrivateKey: "0x" as Hex,
    delegation: artifact.delegation,
    expiresAt: artifact.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    callLimit: artifact.callsUnlimited ? null : artifact.callLimit ?? null,
    callsUnlimited: artifact.callsUnlimited ?? false,
    sessionNonce: (artifact.sessionNonce ?? "0x0") as Hex,
    allowedTokens: artifact.allowedTokens ?? [],
    kind: artifact.kind,
    transferMaxAmount:
      artifact.transferMaxAmount !== undefined && artifact.transferMaxAmount !== null
        ? BigInt(artifact.transferMaxAmount)
        : undefined,
    pairAddresses: artifact.pairAddresses?.map((address) => getAddress(address as Address)),
    perTokenCapsWei: perTokenCaps,
    nativeTokenCapWei: nativeCap,
  } satisfies SessionDelegationInfo;
};

const createConfiguredAgent = () => {
  const openAiKey = process.env.OPENAI_API_KEY ?? process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  if (openAiKey && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = openAiKey;
  }

  const hasApiKey = Boolean(process.env.OPENAI_API_KEY?.trim());

  const trendingConfig = MONORAIL_API_KEY
    ? {
        dataApiUrl: MONORAIL_DATA_API_URL,
        apiKey: MONORAIL_API_KEY,
        tokenMetadata: {
          nativeTokenAddress: getAddress(MONAD_NATIVE_TOKEN_ADDRESS),
          wrappedNativeTokenAddress: getAddress(MONAD_WMON_ADDRESS),
        },
      }
    : undefined;

  const insightOptions = trendingConfig ? { trendingConfig } : {};
  const enableStreaming = hasApiKey && PRAGMA_AGENT_STREAM_INSIGHTS;

  return new PragmaAgent({
    llmClarifier: hasApiKey ? createOpenAiClarifier() : undefined,
    llmInsight: hasApiKey ? createOpenAiInsight(insightOptions) : undefined,
    llmInsightStream: hasApiKey && enableStreaming ? createOpenAiInsightStreamer(insightOptions) : undefined,
  });
};

const sanitizeArtifact = (artifact: DelegationArtifact): DelegationArtifact => ({
  ...artifact,
  sessionKeyPrivateKey: "0x" as Hex,
});

export const POST = async (request: Request) => {
  try {
    const body = (await request.json()) as AgentRequestBody;

    if (typeof body.message !== "string" || body.message.trim().length === 0) {
      return NextResponse.json({ error: "message must be a non-empty string" }, { status: 400 });
    }

    if (!body.delegation?.artifact || !Array.isArray(body.delegation.tokens)) {
      return NextResponse.json({ error: "delegation artifact and tokens are required" }, { status: 400 });
    }

    const agent = createConfiguredAgent();

    const artifact = sanitizeArtifact(body.delegation.artifact);
    const session = toSessionDelegation(artifact);
    if (body.delegation.tokens.length > 0) {
      session.allowedTokens = body.delegation.tokens;
    }

    const delegationContext = buildDelegationContext({
      session,
      metadata: {
        nativeTokenSymbol: MONAD_NATIVE_TOKEN_SYMBOL,
        nativeTokenAddress: MONAD_NATIVE_TOKEN_ADDRESS,
        wrappedNativeSymbol: MONAD_WRAPPED_TOKEN_SYMBOL,
        wrappedNativeAddress: MONAD_WMON_ADDRESS,
        defaultSlippageBps: session.mode === "safe" ? 200 : 500,
        defaultDeadlineMinutes: session.mode === "safe" ? 15 : 30,
        maxSlippageBpsSafe: 500,
        maxSlippageBpsNormal: 1000,
        maxDeadlineMinutesSafe: 60,
        maxDeadlineMinutesNormal: 120,
        chainId: MONAD_CHAIN_ID,
        feeBps: 0,
        feeRecipient: "0x000000000000000000000000000000000000dEaD",
      },
    });

    const quickModeEnabled = body.quickMode === true;

    const quickAction = detectQuickAction(body.message);
    if (quickAction) {
      const quickResponse = await handleQuickAction(quickAction, {
        session,
        artifact,
        delegationContext,
      }, body.delegation.tokens, quickModeEnabled);
      if (quickResponse) {
        return quickResponse;
      }
    }

    const rawResponse = await agent.respond(body.message, {
      delegation: delegationContext,
      metadata: {
        delegator: getAddress(artifact.delegation.delegator as Address),
        sessionKey: session.sessionKeyAddress,
        mode: delegationContext.mode,
      },
    });

    if (rawResponse.type === "insight_stream") {
      return streamAgentInsight(rawResponse as AgentStreamingInsightResult);
    }

    const response = await normalizeResponse(rawResponse);

    return NextResponse.json(response);
  } catch (error) {
    console.error("/api/chat/respond", error);
    return NextResponse.json({ error: parseError(error) }, { status: 500 });
  }
};

const normalizeResponse = async (response: AgentResponse): Promise<AgentResponse> => {
  if (response.type === "insight_stream") {
    const streamed = response as AgentStreamingInsightResult;
    try {
      const body = await streamed.collect();
      return {
        type: "insight",
        title: streamed.title,
        body: body.trim().length > 0 ? body.trim() : "No additional insight is available for this request.",
      };
    } catch (error) {
      return {
        type: "error",
        violations: [
          {
            code: "INSIGHT_STREAM_FAILED",
            message: parseError(error),
          },
        ],
        warnings: [],
      };
    }
  }
  return response;
};

const streamAgentInsight = (streamed: AgentStreamingInsightResult): Response =>
  createSseResponse(async (send) => {
    let accumulated = "";
    try {
      for await (const chunk of streamed.stream) {
        if (!chunk) continue;
        accumulated += chunk;
        send({ type: "chunk", content: chunk });
      }

      try {
        const finalText = await streamed.collect();
        if (finalText) {
          if (!accumulated) {
            accumulated = finalText;
            send({ type: "chunk", content: finalText });
          } else if (finalText.length > accumulated.length) {
            const remainder = finalText.slice(accumulated.length);
            if (remainder) {
              accumulated = finalText;
              send({ type: "chunk", content: remainder });
            }
          }
        }
      } catch (collectError) {
        if (!accumulated) {
          send({ type: "error", message: parseError(collectError) });
          return;
        }
      }

      send({ type: "done" });
    } catch (error) {
      send({ type: "error", message: parseError(error) });
    }
  });
