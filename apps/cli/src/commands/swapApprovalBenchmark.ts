import { Command } from "commander";
import chalk from "chalk";
import { performance } from "node:perf_hooks";
import { encodeFunctionData, formatUnits, getAddress } from "viem";
import { createExecution, ExecutionMode, redeemDelegations } from "@metamask/delegation-toolkit";
import type { ApprovalStrategy } from "@pragma/core";
import { createSessionWallet } from "@pragma/core";

import { loadSwapSession, resolveSwapToken } from "../services/swapArtifacts.js";
import { executeSwapWithSession } from "../services/swapEngine.js";
import { createMonadExecutionClient, createMonadPublicClient, monadChain } from "../services/web3authClients.js";
import {
  MONORAIL_AGGREGATOR_ADDRESS,
  MONAD_EXECUTION_RPC_URL,
} from "../services/config.js";

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface BenchmarkOptions {
  delegator?: string;
  from?: string;
  to?: string;
  amount?: string;
  slippageBps?: string;
}

const DEFAULT_FROM = "WMON";
const DEFAULT_TO = "USDC";
const DEFAULT_AMOUNT = "0.05";
const DEFAULT_SLIPPAGE_BPS = 500;

const routerAddress = getAddress(MONORAIL_AGGREGATOR_ADDRESS);

type SwapSessionContext = Awaited<ReturnType<typeof loadSwapSession>>;

const resetAllowance = async (
  tokenAddress: string,
  ctx: SwapSessionContext,
) => {
  const publicClient = createMonadExecutionClient();
  const token = getAddress(tokenAddress);

  const allowance = (await publicClient.readContract({
    address: token,
    abi: ERC20_APPROVE_ABI,
    functionName: "allowance",
    args: [ctx.delegatorAddress, routerAddress],
  })) as bigint;

  if (allowance === 0n) return;

  const sessionWallet = createSessionWallet(ctx.session, { chain: monadChain, rpcUrl: MONAD_EXECUTION_RPC_URL });
  const callData = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [routerAddress, 0n],
  });

  const execution = createExecution({ target: token, value: 0n, callData });

  const txHash = await redeemDelegations(
    sessionWallet,
    publicClient,
    ctx.environment.DelegationManager as `0x${string}`,
    [
      {
        permissionContext: [ctx.session.delegation],
        executions: [execution],
        mode: ExecutionMode.SingleDefault,
      },
    ],
  );

  await publicClient.waitForTransactionReceipt({ hash: txHash });
};

const runMeasurement = async (
  strategy: ApprovalStrategy,
  amount: string,
  slippageBps: number,
  sessionCtx: SwapSessionContext,
  fromToken: ReturnType<typeof resolveSwapToken>,
  toToken: ReturnType<typeof resolveSwapToken>,
) => {
  await resetAllowance(fromToken.address, sessionCtx);

  const normalizeToken = (token: ReturnType<typeof resolveSwapToken>) => ({
    ...token,
    decimals: typeof token.decimals === "number" ? token.decimals : Number(token.decimals ?? 18),
  });

  const normalizedFrom = normalizeToken(fromToken);
  const normalizedTo = normalizeToken(toToken);

  const start = performance.now();
  const result = await executeSwapWithSession({
    session: sessionCtx.session,
    environment: sessionCtx.environment,
    hybridDelegator: sessionCtx.delegatorAddress,
    intent: {
      from: normalizedFrom,
      to: normalizedTo,
    },
    amountInput: amount,
    slippageBps,
    approvalStrategy: strategy,
    logPrefix: `[${strategy}]`,
    artifactPath: sessionCtx.artifactPath,
  });
  const elapsed = performance.now() - start;

  const publicClient = createMonadPublicClient();
  await publicClient.waitForTransactionReceipt({ hash: result.txHash });

  return {
    strategy,
    elapsed,
    txHash: result.txHash,
    amountOut: formatUnits(result.amountOut, normalizedTo.decimals ?? 18),
  };
};

export const registerSwapApprovalBenchmark = (program: Command) => {
  program
    .command("swap:approval-benchmark")
    .description("[dev] Compare approval strategies (wait vs instant swap)")
    .option("--delegator <address>", "Delegator address (defaults to latest artifact)")
    .option("--from <token>", "Source token symbol or address", DEFAULT_FROM)
    .option("--to <token>", "Destination token symbol or address", DEFAULT_TO)
    .option("--amount <value>", "Swap amount", DEFAULT_AMOUNT)
    .option("--slippage-bps <number>", "Slippage tolerance in basis points", String(DEFAULT_SLIPPAGE_BPS))
    .action(async (options: BenchmarkOptions) => {
      const amount = options.amount ?? DEFAULT_AMOUNT;
      const slippageBps = options.slippageBps ? Number(options.slippageBps) : DEFAULT_SLIPPAGE_BPS;
      if (!Number.isFinite(slippageBps) || slippageBps <= 0) {
        console.error(chalk.red("--slippage-bps must be a positive number."));
        process.exit(1);
      }

      const sessionCtx = await loadSwapSession({ delegator: options.delegator });
      const allowed = sessionCtx.allowedTokens;

      const fromToken = resolveSwapToken(options.from ?? DEFAULT_FROM, allowed);
      const toToken = resolveSwapToken(options.to ?? DEFAULT_TO, allowed);

      const strategies: ApprovalStrategy[] = ["wait", "fire-and-forget"];
      const results = [];
      for (const strategy of strategies) {
        console.log();
        console.log(chalk.blue(`Running swap with approval strategy: ${strategy}`));
        const measurement = await runMeasurement(
          strategy,
          amount,
          slippageBps,
          sessionCtx,
          fromToken,
          toToken,
        );
        results.push(measurement);
        console.log(
          chalk.green(
            `Completed (${strategy}) in ${measurement.elapsed.toFixed(0)} ms (tx: ${measurement.txHash})`,
          ),
        );
      }

      console.log();
      console.log(chalk.bold("Approval strategy comparison"));
      results.forEach((result) => {
        console.log(
          `  - ${result.strategy.padEnd(16)} : ${result.elapsed.toFixed(0)} ms (tx: ${result.txHash})`,
        );
      });
      const delta = results[0].elapsed - results[1].elapsed;
      console.log();
      console.log(chalk.cyan(`Delta (wait - fire-and-forget): ${delta.toFixed(0)} ms`));
    });
};
