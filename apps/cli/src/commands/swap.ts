import { Command } from "commander";
import chalk from "chalk";
import {
  Address,
  Hex,
  encodeFunctionData,
  formatEther,
  formatUnits,
  parseEther,
  getAddress,
  createWalletClient,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createExecution, ExecutionMode, redeemDelegations } from "@metamask/delegation-toolkit";

import {
  loadDelegationArtifact,
  isDelegationExpired,
  loadLatestActiveDelegation,
  diagnoseDelegationSignature,
} from "../services/delegationArtifacts.js";
import { createSepoliaPublicClient } from "../services/web3authClients.js";
import { ROUTER, WETH_SEPOLIA, UNI_SEPOLIA, DeleGatorEnv } from "../services/onboarding4337.js";
import { ERC20_ABI, SWAP_ROUTER_ABI, computeWethUniQuote } from "../services/swapTest.js";
import { getDeleGatorEnvironment } from "@metamask/delegation-toolkit";

const DEFAULT_SLIPPAGE_BPS = 50n; // 0.50%

export const registerSwap = (program: Command) => {
  program
    .command("swap")
    .description("Execute a WETH→UNI swap using the stored delegation")
    .requiredOption("--amount <eth>", "Amount of WETH to swap")
    .option("--artifact <path>", "Path to delegation artifact (defaults to latest active)")
    .option("--delegator <address>", "Specific HybridDelegator when multiple exist")
    .option("--slippage-bps <bps>", "Slippage tolerance in basis points", (value) => BigInt(value), DEFAULT_SLIPPAGE_BPS)
    .action(async ({ artifact: artifactPath, delegator, amount, slippageBps }: { artifact?: string; delegator?: string; amount: string; slippageBps: bigint }) => {
      const parsedAmount = parseEther(amount);
      if (parsedAmount <= 0n) {
        console.error(chalk.red("Amount must be greater than zero."));
        process.exit(1);
      }
      if (slippageBps <= 0n) {
        console.error(chalk.red("Slippage must be positive."));
        process.exit(1);
      }

      const normalizedDelegator = delegator ? getAddress(delegator) : undefined;
      const entry = artifactPath
        ? await loadDelegationArtifact(artifactPath)
        : await loadLatestActiveDelegation(normalizedDelegator);
      const artifact = entry.artifact;
      const filePath = entry.filePath;
      const delegatorAddress = getAddress(artifact.delegation.delegator);

      if (normalizedDelegator && delegatorAddress !== normalizedDelegator) {
        console.error(chalk.red(`Delegation artifact does not match requested delegator ${normalizedDelegator}.`));
        process.exit(1);
      }

      if (isDelegationExpired(artifact)) {
        console.error(
          chalk.red(
            `Delegation from ${filePath} has expired. Issue a new delegation with \`pragma delegation:issue\` before swapping.`,
          ),
        );
        process.exit(1);
      }

      if (!artifact.sessionKeyPrivateKey) {
        console.error(
          chalk.red(
            `Delegation artifact ${filePath} is missing the session key secret. Issue a fresh delegation before swapping.`,
          ),
        );
        process.exit(1);
      }

      const publicClient = createSepoliaPublicClient();
      const environment = getDeleGatorEnvironment(sepolia.id) as DeleGatorEnv;

      const signatureCheck = await diagnoseDelegationSignature(publicClient, environment, artifact);
      if (!signatureCheck.valid) {
        const expected = signatureCheck.expectedSigner ? ` (expected owner ${signatureCheck.expectedSigner})` : "";
        const recovered = signatureCheck.recoveredSigner ? ` Signature was produced by ${signatureCheck.recoveredSigner}.` : "";
        console.error(
          chalk.red(
            `Stored delegation for ${delegatorAddress} is no longer valid (ERC-1271 signature check failed${expected}).${recovered}`,
          ),
        );
        console.log(
          chalk.yellow(
            "Reconnect with the HybridDelegator owner account and issue a fresh delegation (e.g. `pragma delegation:issue`).",
          ),
        );
        process.exit(1);
      }

      const sessionKey = artifact.sessionKeyAddress as Address;
      const sessionKeyPk = artifact.sessionKeyPrivateKey as Hex;

      const wethBalance = (await publicClient.readContract({
        address: WETH_SEPOLIA,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [delegatorAddress],
      })) as bigint;

      if (wethBalance < parsedAmount) {
        console.error(
          chalk.red(
            `Insufficient WETH balance. Delegator holds ${formatUnits(wethBalance, 18)} WETH but ${formatUnits(parsedAmount, 18)} WETH is required.`,
          ),
        );
        console.log("Top up WETH (e.g. via `pragma fund:faucet`) before retrying.");
        process.exit(1);
      }

      const quote = await computeWethUniQuote(publicClient, parsedAmount);
      if (!quote || quote.amountOut === 0n) {
        console.error(chalk.red("Unable to fetch a Uniswap quote for WETH→UNI on Sepolia."));
        process.exit(1);
      }

      const minOut = (quote.amountOut * (10_000n - slippageBps)) / 10_000n;
      const sessionAccount = privateKeyToAccount(sessionKeyPk);
      const sessionWallet = createWalletClient({
        chain: sepolia,
        transport: http(process.env.SEPOLIA_RPC_URL),
        account: sessionAccount,
      });

      console.log(chalk.bold("Executing delegated swap"));
      console.log(`  Delegator   : ${delegatorAddress}`);
      console.log(`  Session key : ${sessionKey}`);
      console.log(`  Amount in   : ${formatUnits(parsedAmount, 18)} WETH`);
      console.log(
        `  Quoted out : ${formatUnits(quote.amountOut, 18)} UNI (min ${formatUnits(minOut, 18)} UNI with ${slippageBps} bps tolerance)`,
      );

      const allowance = (await publicClient.readContract({
        address: WETH_SEPOLIA,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [delegatorAddress, ROUTER],
      })) as bigint;

      const permissionContext = [artifact.delegation];

      if (allowance < parsedAmount) {
        console.log(chalk.gray("Allowance insufficient, submitting approve via delegation."));
        const approveCallData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ROUTER, parsedAmount],
        });

        const approveExecution = createExecution({ target: WETH_SEPOLIA, value: 0n, callData: approveCallData });
        const approveTx = await redeemDelegations(
          sessionWallet,
          publicClient,
          environment.DelegationManager as Address,
          [
            {
              permissionContext,
              executions: [approveExecution],
              mode: ExecutionMode.SingleDefault,
            },
          ],
        );
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        console.log(chalk.green(`Approved router to spend ${formatUnits(parsedAmount, 18)} WETH (tx: ${approveTx})`));
      }

      const fee = Number(quote.fee ?? 3000);

      const swapCallData = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: WETH_SEPOLIA,
            tokenOut: UNI_SEPOLIA,
            fee,
            recipient: delegatorAddress,
            amountIn: parsedAmount,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });

      const swapExecution = createExecution({ target: ROUTER, value: 0n, callData: swapCallData });

      const uniBefore = (await publicClient.readContract({
        address: UNI_SEPOLIA,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [delegatorAddress],
      })) as bigint;

      const swapTx = await redeemDelegations(
        sessionWallet,
        publicClient,
        environment.DelegationManager as Address,
        [
          {
            permissionContext,
            executions: [swapExecution],
            mode: ExecutionMode.SingleDefault,
          },
        ],
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash: swapTx });

      const uniAfter = (await publicClient.readContract({
        address: UNI_SEPOLIA,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [delegatorAddress],
      })) as bigint;

      const delta = uniAfter - uniBefore;

      console.log();
      console.log(
        chalk.green(
          `Swap complete: ${formatUnits(parsedAmount, 18)} WETH -> ${formatUnits(delta, 18)} UNI (tx: ${swapTx}, block ${receipt.blockNumber})`,
        ),
      );
      console.log(
        `View on Etherscan: https://sepolia.etherscan.io/tx/${swapTx}`,
      );
    });

  program
    .command("swap:preview")
    .description("Preview a WETH→UNI swap using the stored delegation without executing")
    .requiredOption("--amount <eth>", "Amount of WETH to preview")
    .option("--artifact <path>", "Path to delegation artifact (defaults to latest active)")
    .option("--delegator <address>", "Specific HybridDelegator when multiple exist")
    .action(async ({ artifact: artifactPath, delegator, amount }: { artifact?: string; delegator?: string; amount: string }) => {
      const parsedAmount = parseEther(amount);
      if (parsedAmount <= 0n) {
        console.error(chalk.red("Amount must be greater than zero."));
        process.exit(1);
      }

      const normalizedDelegator = delegator ? getAddress(delegator) : undefined;
      const entry = artifactPath
        ? await loadDelegationArtifact(artifactPath)
        : await loadLatestActiveDelegation(normalizedDelegator);
      const artifact = entry.artifact;
      const delegatorAddress = getAddress(artifact.delegation.delegator);

      if (normalizedDelegator && delegatorAddress !== normalizedDelegator) {
        console.error(chalk.red(`Delegation artifact does not match requested delegator ${normalizedDelegator}.`));
        process.exit(1);
      }

      if (isDelegationExpired(artifact)) {
        console.error(chalk.red("Delegation has expired. Issue a new delegation before previewing."));
        process.exit(1);
      }

      const publicClient = createSepoliaPublicClient();
      const environment = getDeleGatorEnvironment(sepolia.id) as DeleGatorEnv;
      const signatureCheck = await diagnoseDelegationSignature(publicClient, environment, artifact);
      if (!signatureCheck.valid) {
        const expected = signatureCheck.expectedSigner ? ` (expected owner ${signatureCheck.expectedSigner})` : "";
        const recovered = signatureCheck.recoveredSigner ? ` Signature was produced by ${signatureCheck.recoveredSigner}.` : "";
        console.error(
          chalk.red(
            `Stored delegation for ${delegatorAddress} is no longer valid (ERC-1271 signature check failed${expected}).${recovered}`,
          ),
        );
        console.log(
          chalk.yellow(
            "Reconnect with the HybridDelegator owner account and issue a fresh delegation (e.g. `pragma delegation:issue`).",
          ),
        );
        process.exit(1);
      }

      const quote = await computeWethUniQuote(publicClient, parsedAmount);
      if (!quote || quote.amountOut === 0n) {
        console.error(chalk.red("Unable to fetch a Uniswap quote for WETH→UNI on Sepolia."));
        process.exit(1);
      }

      console.log(chalk.bold("Preview"));
      console.log(`  Delegator : ${delegatorAddress}`);
      console.log(`  Amount in : ${formatUnits(parsedAmount, 18)} WETH`);
      console.log(`  Quote out : ${formatUnits(quote.amountOut, 18)} UNI`);
      console.log(`  Fee tier  : ${quote.fee}`);
      console.log("No transaction submitted. Use `pragma swap --amount …` to execute.");
    });
};
