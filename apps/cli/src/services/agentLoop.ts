import chalk from "chalk";
import inquirer from "inquirer";
import { formatUnits, getAddress } from "viem";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  type CanonicalIntent,
  type SwapIntentFields,
  type TransferIntentFields,
  type WrapIntentFields,
  type AmountSpecification,
  type AgentInsightResult,
  ERC20_ABI,
} from "@pragma/core";

import { loadAgentContext, type LoadedAgentContext } from "./agentContext.js";
import { createMonadPublicClient } from "./web3authClients.js";
import {
  executeSwapWithSession,
  wrapNativeWithSession,
  unwrapNativeWithSession,
} from "./swapEngine.js";
import {
  transferNativeWithSession,
  transferTokenWithSession,
} from "./transferEngine.js";
import { loadTransferSession } from "./transferArtifacts.js";
import type { AllowedToken } from "./monorailTokens.js";
import {
  MONAD_NATIVE_TOKEN_ADDRESS,
  MONAD_WRAPPED_TOKEN_SYMBOL,
  MONAD_WMON_ADDRESS,
} from "./config.js";
import {
  fetchBalancesInsight,
  fetchDelegationInsight,
  fetchTrendingTokensInsight,
} from "./agentInsights.js";
import { createConfiguredAgent } from "./agentFactory.js";
import {
  logAgentContextLoaded,
  logAgentError,
  logAgentInput,
  logAgentMetaCommand,
  logAgentResponse,
} from "./agentTelemetry.js";
import { runRevoke } from "./revoke.js";
import { runOnboard4337 } from "./onboarding4337.js";
import { loadSessionState, saveDelegatorSession, markRequireOnboarding } from "./sessionStore.js";
import { listDelegationArtifacts, isDelegationExpired } from "./delegationArtifacts.js";
import { startLiveObservers } from "./liveObservers.js";

const EXIT_COMMANDS = new Set(["exit", "quit", "q", ":q", "bye"]);

const isNativeToken = (token?: AllowedToken) =>
  !token || token.kind === "native" || token.address.toLowerCase() === MONAD_NATIVE_TOKEN_ADDRESS.toLowerCase();

const listTokenSymbols = (tokens?: AllowedToken[]): string[] =>
  (tokens ?? []).map((token) => token.symbol ?? token.address.slice(0, 6));

const describeAmount = (amount: AmountSpecification): string => {
  switch (amount.kind) {
    case "exact":
      return amount.value;
    case "max":
      return "max";
    case "fraction": {
      if (amount.denominator === 0) return "a portion of your balance";
      const ratio = amount.numerator / amount.denominator;
      if (Math.abs(ratio - 0.5) < 0.01) return "half of your balance";
      if (Math.abs(ratio - 0.25) < 0.01) return "a quarter of your balance";
      if (Math.abs(ratio - 0.75) < 0.01) return "three quarters of your balance";
      if (Math.abs(ratio - 0.3333) < 0.01) return "a third of your balance";
      if (Math.abs(ratio - 0.6666) < 0.01) return "two thirds of your balance";
      const percent = (ratio * 100).toFixed(2).replace(/\.00$/, "");
      return `${percent}% of your balance`;
    }
    default:
      return "unknown";
  }
};

const promptConfirm = async (message: string): Promise<boolean> => {
  if (process.env.PRAGMA_REPL_FIXTURE === "1") {
    console.log(chalk.gray(`[fixture] ${message} -> auto-confirm`));
    return true;
  }
  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: "confirm",
      name: "confirmed",
      message,
      default: false,
    },
  ]);
  return confirmed;
};

const printInsight = (insight: AgentInsightResult) => {
  console.log(chalk.blue(insight.title));
  console.log(insight.body);
};

type QuickAction =
  | { type: "balances" }
  | { type: "delegation" }
  | { type: "trending" }
  | { type: "status" }
  | { type: "help" }
  | { type: "about" }
  | { type: "builders" }
  | { type: "revoke" }
  | { type: "logout" };

const detectQuickAction = (raw: string): QuickAction | undefined => {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return undefined;

  const contains = (keywords: string[]): boolean => keywords.some((keyword) => normalized.includes(keyword));

  if (contains(["balance", "portfolio", "net worth"])) {
    return { type: "balances" };
  }

  if (contains(["delegation", "allowlist", "scope", "limits", "call limit", "ttl", "session" ])) {
    if (contains(["issue", "reissue", "create", "new", "renew", "refresh", "rotate", "reset", "update", "generate", "setup", "set up", "recreate", "redo"])) {
      return undefined;
    }
    return { type: "delegation" };
  }

  if (contains(["trending", "popular", "hot token", "top token", "top project"])) {
    return { type: "trending" };
  }

  if (contains(["status", "overview", "summary"])) {
    return { type: "status" };
  }

  if (contains(["help", "what can you do", "abilities", "capabilities", "how do you work"])) {
    return { type: "help" };
  }

  if (contains(["what is pragma", "about pragma", "tell me about pragma"])) {
    return { type: "about" };
  }

  if (contains(["who built", "who created", "who made pragma", "s0nderlabs"])) {
    return { type: "builders" };
  }

  if (contains(["revoke", "remove delegation", "invalidate delegation", "cancel delegation"])) {
    return { type: "revoke" };
  }

  if (contains(["logout", "sign out", "disconnect", "exit account"])) {
    return { type: "logout" };
  }

  return undefined;
};

const resolveAmountInput = async (
  amount: AmountSpecification,
  tokenDecimals: number,
  fetchBalance: () => Promise<bigint>,
): Promise<{ amountInput: string; resolvedDisplay?: string }> => {
  if (amount.kind === "exact") {
    return { amountInput: amount.value };
  }

  const balance = await fetchBalance();

  if (amount.kind === "max") {
    if (balance === 0n) {
      throw new Error("HybridDelegator balance is zero; cannot use max amount.");
    }
    const decimal = formatUnits(balance, tokenDecimals);
    return { amountInput: decimal, resolvedDisplay: decimal };
  }

  const fraction = (balance * BigInt(amount.numerator)) / BigInt(amount.denominator);
  if (fraction === 0n) {
    throw new Error("Computed fraction results in zero amount. Adjust the fraction or fund the account.");
  }
  const decimal = formatUnits(fraction, tokenDecimals);
  return { amountInput: decimal, resolvedDisplay: decimal };
};

const toSwapToken = (token: AllowedToken) => ({
  ...token,
  decimals: typeof token.decimals === "number" ? token.decimals : Number(token.decimals ?? 18),
});

const handleSwapIntent = async (
  intent: SwapIntentFields,
  agentCtx: LoadedAgentContext,
  publicClient: ReturnType<typeof createMonadPublicClient>,
) => {
  const { swapSession } = agentCtx;
  const fromToken = toSwapToken(intent.tokenIn);
  const toToken = toSwapToken(intent.tokenOut);
  const decimals = typeof fromToken.decimals === "number" ? fromToken.decimals : 18;
  const { delegatorAddress } = swapSession;

  const fetchBalance = async () => {
    if (isNativeToken(fromToken)) {
      return publicClient.getBalance({ address: delegatorAddress });
    }
    return (await publicClient.readContract({
      address: getAddress(fromToken.address),
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [delegatorAddress],
    })) as bigint;
  };

  const { amountInput, resolvedDisplay } = await resolveAmountInput(intent.amount, decimals, fetchBalance);

  const amountLabel = describeAmount(intent.amount);
  const resolvedLabel = resolvedDisplay ?? amountInput;
  const displayLabel = amountLabel && amountLabel !== resolvedLabel ? `${amountLabel} (~${resolvedLabel})` : resolvedLabel;

  console.log(
    chalk.green(
      `Swap request: ${displayLabel} ${fromToken.symbol ?? fromToken.address.slice(0, 6)} → ${
        toToken.symbol ?? toToken.address.slice(0, 6)
      } (slippage ${intent.slippageBps / 100}%)`,
    ),
  );

  const confirm = await promptConfirm("Execute this swap?");
  if (!confirm) {
    console.log(chalk.gray("Swap cancelled."));
    return;
  }

  const result = await executeSwapWithSession({
    session: swapSession.session,
    environment: swapSession.environment,
    hybridDelegator: swapSession.delegatorAddress,
    intent: { from: fromToken, to: toToken },
    amountInput,
    slippageBps: intent.slippageBps,
    logPrefix: "[agent]",
  });

  const amountOutDisplay = formatUnits(result.amountOut, toToken.decimals);
  console.log(
    chalk.green(
      `Swap complete: ${resolvedDisplay ?? amountInput} ${fromToken.symbol ?? "TOKEN"} → ${amountOutDisplay} ${
        toToken.symbol ?? "TOKEN"
      } (tx: ${result.txHash}).`,
    ),
  );
};

const handleWrapIntent = async (
  intent: WrapIntentFields,
  agentCtx: LoadedAgentContext,
  publicClient: ReturnType<typeof createMonadPublicClient>,
) => {
  const { swapSession } = agentCtx;
  const amountLabel = describeAmount(intent.amount);

  console.log(chalk.green(`Wrap request: ${amountLabel} MON → WMON`));
  const confirm = await promptConfirm("Wrap MON now?");
  if (!confirm) {
    console.log(chalk.gray("Wrap cancelled."));
    return;
  }

  const { delegatorAddress } = swapSession;

  const { amountInput, resolvedDisplay } = await resolveAmountInput(intent.amount, 18, () =>
    publicClient.getBalance({ address: delegatorAddress }),
  );

  const result = await wrapNativeWithSession({
    session: swapSession.session,
    environment: swapSession.environment,
    hybridDelegator: delegatorAddress,
    amountInput,
    logPrefix: "[agent]",
  });

  console.log(
    chalk.green(`Wrapped ${resolvedDisplay ?? amountInput} MON into WMON (tx: ${result.txHash}).`),
  );
};

const handleUnwrapIntent = async (
  intent: WrapIntentFields,
  agentCtx: LoadedAgentContext,
  publicClient: ReturnType<typeof createMonadPublicClient>,
) => {
  const { swapSession } = agentCtx;
  const amountLabel = describeAmount(intent.amount);

  console.log(chalk.green(`Unwrap request: ${amountLabel} WMON → MON`));
  const confirm = await promptConfirm("Unwrap WMON now?");
  if (!confirm) {
    console.log(chalk.gray("Unwrap cancelled."));
    return;
  }

  const { delegatorAddress } = swapSession;

  const { amountInput, resolvedDisplay } = await resolveAmountInput(intent.amount, 18, async () => {
    return (await publicClient.readContract({
      address: getAddress(MONAD_WMON_ADDRESS),
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [delegatorAddress],
    })) as bigint;
  });

  const result = await unwrapNativeWithSession({
    session: swapSession.session,
    environment: swapSession.environment,
    hybridDelegator: delegatorAddress,
    amountInput,
    logPrefix: "[agent]",
  });

  console.log(
    chalk.green(`Unwrapped ${resolvedDisplay ?? amountInput} WMON into MON (tx: ${result.txHash}).`),
  );
};

const handleTransferIntent = async (
  intent: TransferIntentFields,
  agentCtx: LoadedAgentContext,
  publicClient: ReturnType<typeof createMonadPublicClient>,
  transferSessionCache: { current?: Awaited<ReturnType<typeof loadTransferSession>> },
) => {
  const tokenLabel = intent.token?.symbol ?? (isNativeToken(intent.token) ? "MON" : "token");
  const amountLabel = describeAmount(intent.amount);
  const recipient = intent.recipient;

  console.log(chalk.green(`Transfer request: ${amountLabel} ${tokenLabel} → ${recipient}`));
  const confirm = await promptConfirm("Execute this transfer?");
  if (!confirm) {
    console.log(chalk.gray("Transfer cancelled."));
    return;
  }

  if (!recipient) {
    throw new Error("Recipient address is required for transfer intents.");
  }

  if (isNativeToken(intent.token)) {
    if (!transferSessionCache.current) {
      transferSessionCache.current = await loadTransferSession({ delegator: agentCtx.delegator });
    }
    const transferSession = transferSessionCache.current;
    const { delegatorAddress } = transferSession;

    const { amountInput, resolvedDisplay } = await resolveAmountInput(intent.amount, 18, () =>
      publicClient.getBalance({ address: delegatorAddress }),
    );

    await transferNativeWithSession({
      session: transferSession.session,
      environment: transferSession.environment,
      hybridDelegator: delegatorAddress,
      recipient: getAddress(recipient),
      amountInput,
      logPrefix: "[agent]",
    });

    console.log(
      chalk.green(`Transferred ${resolvedDisplay ?? amountInput} MON to ${recipient}.`),
    );
  } else if (intent.token) {
    const token = toSwapToken(intent.token);
    const decimals = token.decimals ?? 18;
    const { swapSession } = agentCtx;

    const { amountInput, resolvedDisplay } = await resolveAmountInput(intent.amount, decimals, async () => {
      return (await publicClient.readContract({
        address: getAddress(token.address),
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [swapSession.delegatorAddress],
      })) as bigint;
    });

    await transferTokenWithSession({
      session: swapSession.session,
      environment: swapSession.environment,
      hybridDelegator: swapSession.delegatorAddress,
      token,
      recipient: getAddress(recipient),
      amountInput,
      logPrefix: "[agent]",
    });

    console.log(
      chalk.green(`Transferred ${resolvedDisplay ?? amountInput} ${token.symbol ?? token.address} to ${recipient}.`),
    );
  }
};


const HELP_MESSAGE = `I can help you:
- Swap tokens that are authorised in your delegation.
- Wrap or unwrap MON and WMON.
- Transfer MON or any allowed ERC-20.
- Show your balances, delegation scope, remaining call budget, and token allowlist.
- Surface trending Monad tokens based on Monorail data.
- Reissue or revoke delegations (ask me when you need those flows).
Let me know what you’d like to do in plain language.`;

const handleQuickAction = async (
  action: QuickAction,
  agentCtx: LoadedAgentContext,
): Promise<"continue" | "exit"> => {
  switch (action.type) {
    case "balances": {
      try {
        const insight = await fetchBalancesInsight({
          delegator: agentCtx.delegator,
          sessionKey: agentCtx.swapSession.session.sessionKeyAddress,
          mode: agentCtx.delegationContext.mode,
          allowedTokens: agentCtx.delegationContext.allowedTokens,
        });
        printInsight(insight);
        logAgentResponse({
          delegator: agentCtx.delegator,
          type: "quick_balances",
        });
      } catch (error) {
        logAgentError({ delegator: agentCtx.delegator, error, phase: "balances" });
        throw error;
      }
      return "continue";
    }
    case "delegation": {
      const insight = fetchDelegationInsight({
        delegation: agentCtx.delegationContext,
        metadata: {
          delegator: agentCtx.delegator,
          sessionKey: agentCtx.swapSession.session.sessionKeyAddress,
          mode: agentCtx.delegationContext.mode,
        },
      });
      printInsight(insight);
      logAgentResponse({
        delegator: agentCtx.delegator,
        type: "quick_delegation",
      });
      return "continue";
    }
    case "trending": {
      try {
        const insight = await fetchTrendingTokensInsight();
        printInsight(insight);
        logAgentResponse({
          delegator: agentCtx.delegator,
          type: "quick_trending",
        });
      } catch (error) {
        logAgentError({ delegator: agentCtx.delegator, error, phase: "trending" });
        throw error;
      }
      return "continue";
    }
    case "status": {
      try {
        const balanceInsight = await fetchBalancesInsight({
          delegator: agentCtx.delegator,
          sessionKey: agentCtx.swapSession.session.sessionKeyAddress,
          mode: agentCtx.delegationContext.mode,
          allowedTokens: agentCtx.delegationContext.allowedTokens,
        });
        printInsight(balanceInsight);
      } catch (error) {
        logAgentError({ delegator: agentCtx.delegator, error, phase: "balances" });
        throw error;
      }
      const delegationInsight = fetchDelegationInsight({
        delegation: agentCtx.delegationContext,
        metadata: {
          delegator: agentCtx.delegator,
          sessionKey: agentCtx.swapSession.session.sessionKeyAddress,
          mode: agentCtx.delegationContext.mode,
        },
      });
      printInsight(delegationInsight);
      logAgentResponse({
        delegator: agentCtx.delegator,
        type: "quick_status",
      });
      return "continue";
    }
    case "help": {
      console.log(chalk.blue("What I can do"));
      console.log(HELP_MESSAGE);
      logAgentResponse({
        delegator: agentCtx.delegator,
        type: "quick_help",
      });
      return "continue";
    }
    case "about": {
      console.log(chalk.blue("What is Pragma"));
      console.log(
        "Pragma is Sonderlabs’ agent-first trading stack on the Monad testnet. It gives you a HybridDelegator smart account, session-key delegations, and pre-built tooling so swaps, wraps, unwraps, transfers, and future intents can be issued safely in natural language. Think of it as your autopilot for Monad DeFi—deterministic execution, human-readable guidance, and intent-aware guardrails baked in.",
      );
      console.log("If you’d like a deeper dive into the system design or roadmap, just ask.");
      logAgentResponse({
        delegator: agentCtx.delegator,
        type: "quick_about",
      });
      return "continue";
    }
    case "builders": {
      console.log(chalk.blue("Who built Pragma"));
      console.log(
        "Pragma is built by Sonderlabs, led by founder elpabl0.eth. You can learn more about the team and projects at https://s0nderlabs.xyz.",
      );
      logAgentResponse({
        delegator: agentCtx.delegator,
        type: "quick_builders",
      });
      return "continue";
    }
    case "revoke": {
      const confirm = await promptConfirm(
        "Revoking will bump the NonceEnforcer and invalidate existing delegations. Proceed now?",
      );
      if (!confirm) {
        console.log(chalk.gray("Revocation cancelled."));
        return "continue";
      }
      try {
        await runRevoke({ delegator: agentCtx.delegator });
        await markRequireOnboarding();
        logAgentResponse({ delegator: agentCtx.delegator, type: "quick_revoke" });
      } catch (error) {
        logAgentError({ delegator: agentCtx.delegator, error, phase: "revoke" });
        throw error;
      }
      return "continue";
    }
    case "logout": {
      console.log(chalk.gray("Logging out…"));
      await markRequireOnboarding();
      logAgentResponse({ delegator: agentCtx.delegator, type: "quick_logout" });
      console.log(chalk.gray("Session closed. Run 'pragma' again and complete onboarding to reconnect."));
      return "exit";
    }
    default:
      return "continue";
  }
};

const ensureAgentContext = async (): Promise<LoadedAgentContext> => {
  const state = await loadSessionState();
  const skipAutoOnboard = process.env.PRAGMA_AGENT_SKIP_ONBOARD === "1";

  const loadAndPersist = async (delegator: `0x${string}`) => {
    const ctx = await loadAgentContext(delegator);
    await saveDelegatorSession(ctx.delegator);
    return ctx;
  };

  if (state.delegator && !state.requireOnboard) {
    try {
      return await loadAndPersist(state.delegator);
    } catch {
      await markRequireOnboarding();
    }
  }

  if (!state.requireOnboard) {
    const artifacts = await listDelegationArtifacts();
    const activeEntry = artifacts.find((entry) => {
      const kind = entry.artifact.kind ?? "swap";
      if (kind !== "swap") return false;
      return !isDelegationExpired(entry.artifact) && Boolean(entry.artifact.sessionKeyPrivateKey);
    });

    if (activeEntry?.delegator) {
      try {
        return await loadAndPersist(activeEntry.delegator);
      } catch {
        await markRequireOnboarding();
      }
    }
  }

  if (skipAutoOnboard) {
    throw new Error(
      "No active delegation found in session store and auto-onboarding is disabled (PRAGMA_AGENT_SKIP_ONBOARD=1).",
    );
  }

  console.log(chalk.gray("No active delegation detected or fresh login requested. Starting onboarding…"));
  const result = await runOnboard4337();
  if (!result || !result.delegator) {
    throw new Error("Onboarding cancelled or failed. No delegator connected.");
  }

  return await loadAndPersist(result.delegator);
};

const handleMetaCommand = async (
  line: string,
  state: {
    agentContext: LoadedAgentContext;
    setAgentContext: (ctx: LoadedAgentContext) => Promise<void> | void;
    transferSessionCache: { current?: Awaited<ReturnType<typeof loadTransferSession>> };
  },
): Promise<"continue" | "exit"> => {
  const [commandRaw] = line.slice(1).split(/\s+/);
  const command = commandRaw.toLowerCase();

  logAgentMetaCommand({
    delegator: state.agentContext.delegator,
    command,
  });

  switch (command) {
    case "balances": {
      try {
        const insight = await fetchBalancesInsight({
          delegator: state.agentContext.delegator,
          sessionKey: state.agentContext.swapSession.session.sessionKeyAddress,
          mode: state.agentContext.delegationContext.mode,
        });
        printInsight(insight);
      } catch (error) {
        console.log(chalk.red(`Unable to fetch balances: ${(error as Error).message}`));
        logAgentError({
          delegator: state.agentContext.delegator,
          error,
          phase: "balances",
        });
      }
      return "continue";
    }
    case "delegation": {
      const insight = fetchDelegationInsight({
        delegation: state.agentContext.delegationContext,
        metadata: {
          delegator: state.agentContext.delegator,
          sessionKey: state.agentContext.swapSession.session.sessionKeyAddress,
          mode: state.agentContext.delegationContext.mode,
        },
      });
      printInsight(insight);
      return "continue";
    }
    case "trending": {
      try {
        const insight = await fetchTrendingTokensInsight();
        printInsight(insight);
      } catch (error) {
        console.log(chalk.red(`Unable to fetch trending tokens: ${(error as Error).message}`));
        logAgentError({
          delegator: state.agentContext.delegator,
          error,
          phase: "trending",
        });
      }
      return "continue";
    }
    case "help": {
      console.log(chalk.gray("Meta commands available:"));
      console.log(chalk.gray(":balances – show current balances"));
      console.log(chalk.gray(":delegation – show delegation scope"));
      console.log(chalk.gray(":trending – show featured Monad tokens"));
      console.log(chalk.gray(":logout – exit the current session"));
      console.log(chalk.gray(":exit – close the agent"));
      return "continue";
    }
    case "logout":
      console.log(chalk.gray("Logging out…"));
      await markRequireOnboarding();
      logAgentResponse({ delegator: state.agentContext.delegator, type: "meta_logout" });
      console.log(chalk.gray("Session closed. Run 'pragma' again to reconnect via onboarding."));
      return "exit";
    case "exit":
      return "exit";
    default:
      console.log(chalk.red(`Unknown meta command :${command}`));
      return "continue";
  }
};

const handleIntent = async (
  intent: CanonicalIntent,
  agentCtx: LoadedAgentContext,
  publicClient: ReturnType<typeof createMonadPublicClient>,
  transferSessionCache: { current?: Awaited<ReturnType<typeof loadTransferSession>> },
): Promise<LoadedAgentContext | undefined> => {
  switch (intent.action) {
    case "swap":
      await handleSwapIntent(intent, agentCtx, publicClient);
      return undefined;
    case "wrap":
      await handleWrapIntent(intent, agentCtx, publicClient);
      return undefined;
    case "unwrap":
      await handleUnwrapIntent(intent, agentCtx, publicClient);
      return undefined;
    case "transfer":
      await handleTransferIntent(intent, agentCtx, publicClient, transferSessionCache);
      return undefined;
    case "delegation_issue": {
      console.log(chalk.green("Issuing a fresh delegation…"));
      try {
        const result = await runOnboard4337(intent.mode);
        if (!result || !result.delegator) {
          console.log(chalk.gray("Delegation issuance cancelled."));
          return undefined;
        }
        const refreshedContext = await loadAgentContext(result.delegator);
        await saveDelegatorSession(refreshedContext.delegator);
        console.log(
          chalk.green(
            `Delegation updated for ${refreshedContext.delegator} (mode: ${refreshedContext.delegationContext.mode}).`,
          ),
        );
        return refreshedContext;
      } catch (error) {
        console.log(chalk.red((error as Error).message));
        throw error;
      }
    }
    default:
      console.log(chalk.gray(`Intent ${(intent as any).action ?? "unknown"} is not executable yet.`));
      return undefined;
  }
};

const promptLine = async (promptLabel: string): Promise<string> => {
  const rl = createInterface({ input, output, terminal: true });
  try {
    return await rl.question(promptLabel);
  } finally {
    rl.close();
  }
};

export interface AgentReplOptions {
  prompt?: (label: string) => Promise<string>;
}

export const runPragmaAgentRepl = async (options: AgentReplOptions = {}): Promise<void> => {
  let agentContext = await ensureAgentContext();
  logAgentContextLoaded({
    delegator: agentContext.delegator,
    mode: agentContext.delegationContext.mode,
    tokens: listTokenSymbols(agentContext.delegationContext.allowedTokens),
    sessionKey: agentContext.swapSession.session.sessionKeyAddress,
  });
  console.log(chalk.gray("Connected. Ask me anything or type 'logout' to disconnect."));

  const agent = createConfiguredAgent();
  const publicClient = createMonadPublicClient();
  const transferSessionCache: { current?: Awaited<ReturnType<typeof loadTransferSession>> } = {};

  const liveObserverState: {
    timeout?: NodeJS.Timeout;
    promise?: Promise<void>;
    handle?: Awaited<ReturnType<typeof startLiveObservers>>;
  } = {};

  const startObserversForContext = (ctx: LoadedAgentContext) => {
    const delegationManagerAddress = getAddress(
      ctx.swapSession.environment.DelegationManager,
    ) as `0x${string}`;

    const kickoff = async () => {
      try {
        liveObserverState.handle = await startLiveObservers({
          delegator: ctx.delegator,
          sessionKey: ctx.swapSession.session.sessionKeyAddress,
          delegationManager: delegationManagerAddress,
          allowedTokens: ctx.delegationContext.allowedTokens,
          publicClient,
        });
      } catch (error) {
        console.log(
          chalk.red(
            `[observer] Unable to initialise live monitoring: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    };

    const schedule = () => {
      liveObserverState.timeout = undefined;
      liveObserverState.promise = kickoff();
    };

    if (liveObserverState.timeout) {
      clearTimeout(liveObserverState.timeout);
    }
    liveObserverState.timeout = setTimeout(schedule, 0);
  };

  const stopObservers = async () => {
    if (liveObserverState.timeout) {
      clearTimeout(liveObserverState.timeout);
      liveObserverState.timeout = undefined;
    }
    if (liveObserverState.promise) {
      try {
        await liveObserverState.promise;
      } catch {
        // ignore start failures
      }
    }
    if (liveObserverState.handle) {
      await liveObserverState.handle.stop();
      liveObserverState.handle = undefined;
    }
    liveObserverState.promise = undefined;
  };

  startObserversForContext(agentContext);

  console.log(chalk.bold(`Pragma Agent — connected to ${agentContext.delegator}`));
  console.log(chalk.gray("Type 'exit' to leave the chat."));
  console.log();

  const promptFn = options.prompt ?? promptLine;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const inputLine = await promptFn(chalk.cyan("pragma> "));
      const line = inputLine.trim();
      if (!line) continue;

      const isMeta = line.startsWith(":");
      logAgentInput({
        delegator: agentContext.delegator,
        line,
        isMeta,
      });

      if (!isMeta) {
        const quickAction = detectQuickAction(line);
        if (quickAction) {
          try {
            const result = await handleQuickAction(quickAction, agentContext);
            if (result === "exit") {
              break;
            }
          } catch (error) {
            console.log(chalk.red((error as Error).message));
          }
          continue;
        }
      }

      if (isMeta) {
        const metaResult = await handleMetaCommand(line, {
          agentContext,
          setAgentContext: async (ctx: LoadedAgentContext) => {
            agentContext = ctx;
            transferSessionCache.current = undefined;
            await stopObservers();
            startObserversForContext(agentContext);
          },
          transferSessionCache,
        });
        if (metaResult === "exit") {
          console.log(chalk.gray("Goodbye."));
          break;
        }
        continue;
      }

      if (EXIT_COMMANDS.has(line.toLowerCase())) {
        console.log(chalk.gray("Goodbye."));
        break;
      }

  try {
        const response = await agent.respond(line, {
          delegation: agentContext.delegationContext,
          metadata: {
            delegator: agentContext.delegator,
            sessionKey: agentContext.swapSession.session.sessionKeyAddress,
            mode: agentContext.delegationContext.mode,
          },
        });

        switch (response.type) {
          case "intent":
            {
              const updatedContext = await handleIntent(
                response.intent,
                agentContext,
                publicClient,
                transferSessionCache,
              );
              if (updatedContext) {
                agentContext = updatedContext;
                transferSessionCache.current = undefined;
                await stopObservers();
                startObserversForContext(agentContext);
              }
            }
            if (response.warnings.length > 0) {
              console.log(chalk.gray(`Notes: ${response.warnings.join(", ")}`));
            }
            logAgentResponse({
              delegator: agentContext.delegator,
              type: "intent",
              extra: {
                action: response.intent.action,
              },
            });
            break;

          case "clarification":
            console.log(chalk.yellow("Need a bit more detail:"));
            response.clarification.questions.forEach((question, index) => {
              console.log(chalk.yellow(`${index + 1}. ${question.prompt}`));
            });
            if (response.warnings.length > 0) {
              console.log(chalk.gray(`Notes: ${response.warnings.join(", ")}`));
            }
            logAgentResponse({
              delegator: agentContext.delegator,
              type: "clarification",
              extra: {
                questions: response.clarification.questions.length,
              },
            });
            break;

          case "error":
            console.log(chalk.red("Could not interpret request:"));
            response.violations.forEach((violation) => {
              console.log(chalk.red(`- ${violation.code}: ${violation.message}`));
            });
            if (response.warnings.length > 0) {
              console.log(chalk.gray(`Notes: ${response.warnings.join(", ")}`));
            }
            logAgentResponse({
              delegator: agentContext.delegator,
              type: "error",
              extra: {
                violations: response.violations.map((violation) => violation.code),
              },
            });
            break;

          case "insight":
            console.log(chalk.blue(response.title));
            console.log(response.body);
            logAgentResponse({
              delegator: agentContext.delegator,
              type: "insight",
              extra: {
                title: response.title,
              },
            });
            break;

          default:
            console.log(chalk.gray("Unhandled response."));
        }
      } catch (error) {
        console.log(chalk.red((error as Error).message));
        logAgentError({
          delegator: agentContext.delegator,
          error,
          phase: "intent",
        });
      }
    }
  } finally {
    await stopObservers();
  }
};
