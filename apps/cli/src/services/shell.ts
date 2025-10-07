import chalk from "chalk";
import inquirer from "inquirer";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { formatUnits, getAddress } from "viem";

import { renderStatusSnapshot } from "./status.js";
import { getStatusSnapshot } from "./status.js";
import {
  listDelegationArtifacts,
  loadDelegationArtifact,
  loadLatestActiveDelegation,
} from "./delegationArtifacts.js";
import { runOnboard4337, type Mode } from "./onboarding4337.js";
import { loadSwapSession } from "./swapArtifacts.js";
import {
  executeSwapWithSession,
  wrapNativeWithSession,
  unwrapNativeWithSession,
  isNativeToken,
} from "./swapEngine.js";
import { runRevoke } from "./revoke.js";
import { fetchMonorailQuote } from "./monorailPathfinder.js";
import type { AllowedToken } from "./monorailTokens.js";

const SHELL_STATE_DIR = path.join(os.homedir(), ".pragma");
const SHELL_STATE_PATH = path.join(SHELL_STATE_DIR, "shell.json");

interface ShellPreferences {
  defaultDelegator?: `0x${string}`;
  defaultAmount?: string;
  defaultSlippageBps?: number;
}

const loadPreferences = async (): Promise<ShellPreferences> => {
  try {
    const raw = await fs.readFile(SHELL_STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as ShellPreferences;
    return parsed ?? {};
  } catch (error: any) {
    if (error?.code === "ENOENT") return {};
    return {};
  }
};

const savePreferences = async (prefs: ShellPreferences) => {
  try {
    await fs.mkdir(SHELL_STATE_DIR, { recursive: true });
    await fs.writeFile(SHELL_STATE_PATH, JSON.stringify(prefs, null, 2), "utf8");
  } catch (error) {
    console.log(chalk.gray(`Warning: failed to persist shell preferences (${(error as Error).message})`));
  }
};

const describeArtifact = (entry: { delegator?: string; filePath: string; artifact: any }): string => {
  const ttl = entry.artifact.expiresAt
    ? entry.artifact.expiresAt - Math.floor(Date.now() / 1000)
    : undefined;
  const ttlLabel = ttl !== undefined
    ? ttl <= 0
      ? chalk.red("expired")
      : `${Math.floor(ttl / 3600)}h`
    : "unknown";
  return `${entry.delegator ?? entry.artifact.delegation.delegator} · ${ttlLabel}`;
};

const pickDelegator = async (): Promise<{ delegator: `0x${string}`; filePath: string }> => {
  const artifacts = await listDelegationArtifacts();
  if (artifacts.length === 0) {
    throw new Error("No delegation artifacts found. Run onboarding first.");
  }

  const deduped = new Map<string, (typeof artifacts)[number]>();
  for (const entry of artifacts) {
    const delegator = entry.delegator ?? getAddress(entry.artifact.delegation.delegator);
    if (!deduped.has(delegator)) {
      deduped.set(delegator, { ...entry, delegator });
    }
  }

  const choices = Array.from(deduped.values()).map((entry) => ({
    name: describeArtifact(entry),
    value: entry.filePath,
  }));

  const { selected } = await inquirer.prompt<{ selected: string }>([
    {
      type: "list",
      name: "selected",
      message: "Select delegation",
      choices,
    },
  ]);

  const loaded = await loadDelegationArtifact(selected);
  const delegator = getAddress(loaded.artifact.delegation.delegator);
  return { delegator, filePath: selected };
};

const ensureDelegator = async (
  prefs: ShellPreferences,
): Promise<{ delegator: `0x${string}`; filePath?: string }> => {
  if (prefs.defaultDelegator) {
    return { delegator: getAddress(prefs.defaultDelegator) as `0x${string}` };
  }
  const selection = await pickDelegator();
  prefs.defaultDelegator = selection.delegator;
  await savePreferences(prefs);
  return selection;
};

const selectMode = async (initial?: Mode): Promise<Mode> => {
  const { mode } = await inquirer.prompt<{ mode: Mode }>([
    {
      type: "list",
      name: "mode",
      message: "Select mode",
      default: initial ?? "safe",
      choices: [
        { name: "Safe (pair scoped)", value: "safe" },
        { name: "Normal (allowlist)", value: "normal" },
      ],
    },
  ]);
  return mode;
};

const chooseToken = async (tokens: AllowedToken[], prompt: string): Promise<AllowedToken> => {
  const choices = tokens.map((token) => ({
    name: `${token.symbol ?? token.address} (${token.address})`,
    value: token.address,
  }));
  const { tokenAddress } = await inquirer.prompt<{ tokenAddress: string }>([
    {
      type: "list",
      name: "tokenAddress",
      message: prompt,
      choices,
    },
  ]);
  const token = tokens.find((item) => item.address === tokenAddress);
  if (!token) {
    throw new Error("Token selection failed.");
  }
  return token;
};

const promptAmount = async (defaultAmount?: string, label = "Amount to swap") => {
  const { amount } = await inquirer.prompt<{ amount: string }>([
    {
      type: "input",
      name: "amount",
      message: label,
      default: defaultAmount ?? "0.01",
      validate: (input: string) => (Number(input) > 0 ? true : "Enter a positive number"),
    },
  ]);
  return amount;
};

const promptSlippage = async (defaultBps?: number) => {
  const { slippage } = await inquirer.prompt<{ slippage: string }>([
    {
      type: "input",
      name: "slippage",
      message: "Slippage (bps)",
      default: defaultBps?.toString() ?? "50",
      validate: (input: string) => (Number(input) > 0 ? true : "Enter a positive number"),
    },
  ]);
  return Number(slippage);
};

const showStatus = async (prefs: ShellPreferences) => {
  if (prefs.defaultDelegator) {
    try {
      const loaded = await loadLatestActiveDelegation(prefs.defaultDelegator);
      renderStatusSnapshot({
        delegation: {
          mode: loaded.artifact.mode,
          delegator: loaded.artifact.delegation.delegator as `0x${string}`,
          sessionKey: loaded.artifact.sessionKeyAddress,
          expiresAt: loaded.artifact.expiresAt ?? 0,
          filePath: loaded.filePath,
          isExpired: false,
          ethBalanceWei: undefined,
          wrappedBalanceWei: undefined,
          wrappedToken: undefined,
          allowedTokens: loaded.artifact.allowedTokens,
        },
      });
      return;
    } catch (error) {
      console.log(chalk.gray(`Status for ${prefs.defaultDelegator} unavailable: ${(error as Error).message}`));
    }
  }
  const snapshot = await getStatusSnapshot();
  renderStatusSnapshot(snapshot);
};

const showDelegationList = async () => {
  const artifacts = await listDelegationArtifacts();
  if (artifacts.length === 0) {
    console.log(chalk.yellow("No delegation artifacts found."));
    return;
  }
  const deduped = new Map<string, (typeof artifacts)[number]>();
  for (const entry of artifacts) {
    const delegator = entry.delegator ?? getAddress(entry.artifact.delegation.delegator);
    if (!deduped.has(delegator)) {
      deduped.set(delegator, { ...entry, delegator });
    }
  }

  console.log(chalk.bold("Delegations"));
  for (const entry of deduped.values()) {
    const delegator = entry.delegator ?? entry.artifact.delegation.delegator;
    const mode = entry.artifact.mode;
    const expiresAt = entry.artifact.expiresAt
      ? new Date(entry.artifact.expiresAt * 1000).toISOString()
      : "unknown";
    console.log(`${delegator} · mode ${mode} · expires ${expiresAt}`);
    if (entry.artifact.allowedTokens && entry.artifact.allowedTokens.length > 0) {
      entry.artifact.allowedTokens.slice(0, 5).forEach((token) => {
        const tags: string[] = [];
        if (token.kind === "native") tags.push("native");
        if (token.kind === "wrappedNative") tags.push("wrapped");
        if (token.categories && token.categories.length > 0) tags.push(...token.categories.slice(0, 3));
        const suffix = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
        console.log(`    - ${token.symbol ?? token.address} (${token.address})${suffix}`);
      });
      if (entry.artifact.allowedTokens.length > 5) {
        console.log("    …");
      }
    }
  }
};

const performSwap = async (prefs: ShellPreferences) => {
  const { delegator } = await ensureDelegator(prefs);
  const { session, environment, allowedTokens } = await loadSwapSession({ delegator });
  if (allowedTokens.length < 2) {
    throw new Error("Delegation allowlist must include at least two tokens before swapping.");
  }

  const fromToken = await chooseToken(allowedTokens, "Select source token");
  const toChoices = allowedTokens.filter((token) => token.address !== fromToken.address);
  const toToken = await chooseToken(toChoices, "Select destination token");

  const amount = await promptAmount(prefs.defaultAmount);
  const slippage = await promptSlippage(prefs.defaultSlippageBps);

  prefs.defaultAmount = amount;
  prefs.defaultSlippageBps = slippage;
  await savePreferences(prefs);

  const result = await executeSwapWithSession({
    session,
    environment,
    hybridDelegator: delegator,
    intent: { from: fromToken, to: toToken },
    amountInput: amount,
    slippageBps: slippage,
    logPrefix: "[shell]",
  });

  const { quote } = result;
  if (quote.fees) {
    const protocolFee = quote.fees.protocolAmount
      ? formatUnits(quote.fees.protocolAmount, toToken.decimals)
      : undefined;
    const refFee = quote.fees.feeShareAmount
      ? formatUnits(quote.fees.feeShareAmount, toToken.decimals)
      : undefined;
    console.log(
      chalk.gray(
        `  Fees: protocol ${quote.fees.protocolBps ?? 0} bps${
          protocolFee ? ` (~${protocolFee} ${toToken.symbol ?? toToken.address})` : ""
        }${
          quote.fees.feeShareBps
            ? ` · ref ${quote.fees.feeShareBps} bps${
                refFee ? ` (~${refFee} ${toToken.symbol ?? toToken.address})` : ""
              }`
            : ""
        }`,
      ),
    );
  }
  if (quote.compoundImpact) {
    console.log(chalk.gray(`  Price impact: ${quote.compoundImpact}%`));
  }
  if (quote.routes && quote.routes.length > 0) {
    console.log(chalk.gray("  Routes:"));
    quote.routes.slice(0, 3).forEach((route, index) => {
      const legLabel = `${route.fromSymbol ?? route.from ?? "?"} → ${route.toSymbol ?? route.to ?? "?"}`;
      console.log(chalk.gray(`    ${index + 1}. ${legLabel}`));
      if (route.splits && route.splits.length > 0) {
        route.splits.forEach((split) => {
          const pctValue = split.percentage !== undefined
            ? split.percentage > 1
              ? split.percentage
              : split.percentage * 100
            : undefined;
          const pct = pctValue !== undefined ? `${pctValue.toFixed(2)}%` : "n/a";
          const fee = split.feeBps !== undefined ? `${split.feeBps} bps` : "n/a";
          console.log(chalk.gray(`       - ${split.protocol ?? "Unknown"}: ${pct}, fee ${fee}`));
        });
      }
    });
  }
};

const performPreview = async (prefs: ShellPreferences) => {
  const { delegator } = await ensureDelegator(prefs);
  const { session, allowedTokens } = await loadSwapSession({ delegator });
  if (allowedTokens.length < 2) {
    throw new Error("Delegation allowlist must include at least two tokens before previewing swaps.");
  }

  const fromToken = await chooseToken(allowedTokens, "Select source token");
  const toChoices = allowedTokens.filter((token) => token.address !== fromToken.address);
  const toToken = await chooseToken(toChoices, "Select destination token");
  const amount = await promptAmount(prefs.defaultAmount, "Amount to preview");
  const slippage = await promptSlippage(prefs.defaultSlippageBps);

  const quote = await fetchMonorailQuote({
    fromToken: fromToken.address,
    toToken: toToken.address,
    amountDecimal: amount,
    sender: delegator,
    destination: delegator,
    maxSlippageBps: slippage,
  });

  console.log(chalk.bold("Swap Preview"));
  console.log(
    `${quote.inputFormatted ?? amount} ${fromToken.symbol ?? fromToken.address} → ${
      quote.outputFormatted ?? formatUnits(quote.rawOutput, toToken.decimals)
    } ${toToken.symbol ?? toToken.address}`,
  );
  console.log(`Min output  : ${quote.minOutputFormatted ?? formatUnits(quote.rawMinOutput, toToken.decimals)}`);
  if (quote.compoundImpact) console.log(`Price impact: ${quote.compoundImpact}%`);
  if (quote.optimisation) console.log(`Optimisation: ${quote.optimisation}`);
};

const performWrap = async (prefs: ShellPreferences) => {
  const { delegator } = await ensureDelegator(prefs);
  const { session, environment } = await loadSwapSession({ delegator });
  const amount = await promptAmount(undefined, "Amount of MON to wrap");
  await wrapNativeWithSession({
    session,
    environment,
    hybridDelegator: delegator,
    amountInput: amount,
    logPrefix: "[shell]",
  });
};

const performUnwrap = async (prefs: ShellPreferences) => {
  const { delegator } = await ensureDelegator(prefs);
  const { session, environment } = await loadSwapSession({ delegator });
  const amount = await promptAmount(undefined, "Amount of WMON to unwrap");
  await unwrapNativeWithSession({
    session,
    environment,
    hybridDelegator: delegator,
    amountInput: amount,
    logPrefix: "[shell]",
  });
};

const performPrune = async (prefs: ShellPreferences) => {
  const { delegator } = await ensureDelegator(prefs);
  const loaded = await loadLatestActiveDelegation(delegator);
  if (loaded.artifact.mode === "safe") {
    console.log(chalk.yellow("Safe mode delegation cannot be pruned. Reissue in normal mode."));
    return;
  }
  const tokens = (loaded.artifact.allowedTokens ?? []) as AllowedToken[];
  if (tokens.length <= 2) {
    console.log(chalk.yellow("Delegation already at minimum token set."));
    return;
  }
  const choices = tokens.map((token) => ({ name: `${token.symbol ?? token.address}`, value: token.address }));
  const { removal } = await inquirer.prompt<{ removal: string[] }>([
    {
      type: "checkbox",
      name: "removal",
      message: "Select tokens to remove",
      choices,
    },
  ]);
  if (removal.length === 0) {
    console.log(chalk.gray("No changes applied."));
    return;
  }
  const nextTokens = tokens.filter((token) => !removal.includes(token.address));
  if (nextTokens.length < 2) {
    console.log(chalk.red("At least two tokens must remain."));
    return;
  }
  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: "confirm",
      name: "confirm",
      message: "Reissue delegation with reduced token set?",
      default: true,
    },
  ]);
  if (!confirm) return;
  await runOnboard4337("normal", undefined, {
    expectedDelegator: delegator,
    overrideAllowedTokens: nextTokens,
    existingAllowedTokens: nextTokens,
    callLimitOverride: loaded.artifact.callLimit ?? undefined,
    unlimitedCalls: loaded.artifact.callsUnlimited ?? false,
  });
};

const performUpdateTokens = async (prefs: ShellPreferences) => {
  const { delegator } = await ensureDelegator(prefs);
  const loaded = await loadLatestActiveDelegation(delegator);
  const mode = loaded.artifact.mode as Mode;
  await runOnboard4337(mode, undefined, {
    expectedDelegator: delegator,
    existingAllowedTokens: loaded.artifact.allowedTokens,
    callLimitOverride: loaded.artifact.callLimit ?? undefined,
    unlimitedCalls: loaded.artifact.callsUnlimited ?? false,
  });
};

const performRevoke = async (prefs: ShellPreferences) => {
  const { delegator } = await ensureDelegator(prefs);
  const loaded = await loadLatestActiveDelegation(delegator);
  await runRevoke({
    mode: loaded.artifact.mode as Mode,
    delegator,
    disableOnly: false,
    alsoDisable: false,
  });
};

const setDefaultDelegator = async (prefs: ShellPreferences) => {
  const selection = await pickDelegator();
  prefs.defaultDelegator = selection.delegator;
  await savePreferences(prefs);
  console.log(chalk.green(`Default delegator set to ${selection.delegator}`));
};

const clearDefaults = async (prefs: ShellPreferences) => {
  prefs.defaultDelegator = undefined;
  prefs.defaultAmount = undefined;
  prefs.defaultSlippageBps = undefined;
  await savePreferences(prefs);
  console.log(chalk.green("Cleared stored preferences."));
};

export const runShell = async () => {
  const prefs = await loadPreferences();
  let running = true;
  while (running) {
    console.log();
    console.log(chalk.bold("Pragma Shell"));
    if (prefs.defaultDelegator) {
      console.log(chalk.gray(`Default delegator: ${prefs.defaultDelegator}`));
    }
    console.log();

    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: "list",
        name: "action",
        message: "Select action",
        choices: [
          { name: "Status", value: "status" },
          { name: "Delegations", value: "delegations" },
          { name: "Onboard 4337", value: "onboard" },
          { name: "Swap", value: "swap" },
          { name: "Swap preview", value: "preview" },
          { name: "Wrap MON → WMON", value: "wrap" },
          { name: "Unwrap WMON → MON", value: "unwrap" },
          { name: "Delegation – update tokens", value: "updateTokens" },
          { name: "Delegation – prune tokens", value: "pruneTokens" },
          { name: "Delegation – revoke", value: "revoke" },
          { name: "Set default delegator", value: "setDelegator" },
          { name: "Clear preferences", value: "clearPrefs" },
          { name: "Exit", value: "exit" },
        ],
      },
    ]);

    try {
      switch (action) {
        case "status":
          await showStatus(prefs);
          break;
        case "delegations":
          await showDelegationList();
          break;
        case "onboard": {
          const mode = await selectMode();
          await runOnboard4337(mode);
          break;
        }
        case "swap":
          await performSwap(prefs);
          break;
        case "preview":
          await performPreview(prefs);
          break;
        case "wrap":
          await performWrap(prefs);
          break;
        case "unwrap":
          await performUnwrap(prefs);
          break;
        case "updateTokens":
          await performUpdateTokens(prefs);
          break;
        case "pruneTokens":
          await performPrune(prefs);
          break;
        case "revoke":
          await performRevoke(prefs);
          break;
        case "setDelegator":
          await setDefaultDelegator(prefs);
          break;
        case "clearPrefs":
          await clearDefaults(prefs);
          break;
        case "exit":
        default:
          running = false;
          break;
      }
    } catch (error) {
      console.log(chalk.red((error as Error).message));
    }
  }
  console.log(chalk.gray("Exiting Pragma shell."));
};
