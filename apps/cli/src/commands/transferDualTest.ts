import chalk from "chalk";
import { Command } from "commander";
import { privateKeyToAccount } from "viem/accounts";
import {
  Address,
  Hex,
  createWalletClient,
  formatEther,
  formatUnits,
  getAddress,
  http,
  parseEther,
  parseUnits,
} from "viem";

import { setupHybridDelegatorTest } from "../services/onboarding4337.js";
import { loadTransferSession } from "../services/transferArtifacts.js";
import { loadSwapSession } from "../services/swapArtifacts.js";
import { transferNativeWithSession, transferTokenWithSession } from "../services/transferEngine.js";
import { wrapNativeWithSession } from "../services/swapEngine.js";
import { createMonadPublicClient, monadChain } from "../services/web3authClients.js";
import {
  MONAD_NATIVE_TOKEN_SYMBOL,
  MONAD_RPC_URL,
  MONAD_WMON_ADDRESS,
  MONAD_WRAPPED_TOKEN_SYMBOL,
  PRAGMA_ADMIN_TEST_PK,
} from "../services/config.js";
import type { AllowedToken } from "../services/monorailTokens.js";

const DAK_ADDRESS = getAddress("0x0F0BDEbF0F83cD1EE3974779Bcb7315f9808c714");
const ADMIN_ADDRESS = getAddress("0x2902508823B156bA359c0a0F8d4421186bc3E23f");

const findToken = (tokens: AllowedToken[], match: (token: AllowedToken) => boolean): AllowedToken | undefined =>
  tokens.find((token) => match(token));

export const registerTransferDualTest = (program: Command) => {
  program
    .command("transfer:test:dual")
    .description(
      "[dev] Provision, fund, and validate native & ERC-20 transfers (MON + DAK) using the delegated session",
    )
    .option("--mode <mode>", "Delegation mode: safe | normal", "normal")
    .option("--native <amount>", "Native MON amount to transfer back", "0.05")
    .option("--erc20 <amount>", "DAK amount to transfer back", "0.05")
    .action(async ({ mode, native, erc20 }: { mode?: string; native?: string; erc20?: string }) => {
      const normalizedMode = (mode ?? "normal").toLowerCase();
      if (normalizedMode !== "safe" && normalizedMode !== "normal") {
        console.error(chalk.red("Invalid mode. Use 'safe' or 'normal'."));
        process.exit(1);
      }

      if (!PRAGMA_ADMIN_TEST_PK) {
        console.error(chalk.red("PRAGMA_ADMIN_TEST_PK must be configured in the environment."));
        process.exit(1);
      }

      const adminAccount = privateKeyToAccount(PRAGMA_ADMIN_TEST_PK as Hex);
      const adminWallet = createWalletClient({
        chain: monadChain,
        transport: http(MONAD_RPC_URL),
        account: adminAccount,
      });
      const publicClient = createMonadPublicClient();

      const wrappedTokenOverride: AllowedToken = {
        address: getAddress(MONAD_WMON_ADDRESS),
        symbol: MONAD_WRAPPED_TOKEN_SYMBOL ?? "WMON",
        decimals: 18,
        kind: "wrappedNative",
        categories: ["wrapped"],
      };
      const dakToken: AllowedToken = {
        address: DAK_ADDRESS,
        symbol: "DAK",
        decimals: 18,
        kind: "erc20",
        categories: ["custom"],
      };

      const context = await setupHybridDelegatorTest(normalizedMode as "safe" | "normal", {
        logSessionSummaries: true,
        allowedTokenOverrides: [wrappedTokenOverride, dakToken],
      });
      const swapSession = context.sessionDelegations.find((entry) => entry.mode === normalizedMode && entry.kind !== "transfer");
      if (!swapSession) {
        console.error(chalk.red("No swap delegation generated. Ensure onboarding produced swap scope."));
        process.exit(1);
      }

      const transferSessionContext = await loadTransferSession({ delegator: context.hybridDelegator as Address });
      const transferSession = transferSessionContext.session;

      // Pre-fund HybridDelegator with MON and DAK
      const nativeFund = parseEther("0.1");
      const nativeFundTx = await adminWallet.sendTransaction({ to: context.hybridDelegator, value: nativeFund });
      await publicClient.waitForTransactionReceipt({ hash: nativeFundTx });
      console.log(
        chalk.green(
          `[dual/${normalizedMode}] Funded delegator ${context.hybridDelegator} with ${formatEther(nativeFund)} ${
            MONAD_NATIVE_TOKEN_SYMBOL ?? "MON"
          } (tx: ${nativeFundTx})`,
        ),
      );

      const dakAmount = parseUnits("0.1", dakToken.decimals);
      const fundDakTx = await adminWallet.writeContract({
        address: DAK_ADDRESS,
        abi: [
          {
            type: "function",
            name: "transfer",
            stateMutability: "nonpayable",
            inputs: [
              { name: "to", type: "address" },
              { name: "value", type: "uint256" },
            ],
            outputs: [{ name: "", type: "bool" }],
          },
        ] as const,
        functionName: "transfer",
        args: [context.hybridDelegator as Address, dakAmount],
      });
      await publicClient.waitForTransactionReceipt({ hash: fundDakTx });
      console.log(
        chalk.green(
          `[dual/${normalizedMode}] Funded delegator ${context.hybridDelegator} with ${formatUnits(dakAmount, dakToken.decimals)} DAK (tx: ${fundDakTx})`,
        ),
      );

      // Fund session key so it can pay intrinsic gas for redeemDelegations if required
      const sessionTopup = parseEther("0.5");
      const sessionTopupTx = await adminWallet.sendTransaction({
        to: transferSession.sessionKeyAddress,
        value: sessionTopup,
      });
      await publicClient.waitForTransactionReceipt({ hash: sessionTopupTx });
      console.log(
        chalk.green(
          `[dual/${normalizedMode}] Funded session key ${transferSession.sessionKeyAddress} with ${formatEther(sessionTopup)} ${
            MONAD_NATIVE_TOKEN_SYMBOL ?? "MON"
          } (tx: ${sessionTopupTx})`,
        ),
      );

      // Native transfer back to admin
      const nativeAmountInput = native ?? "0.05";
      await transferNativeWithSession({
        session: transferSession,
        environment: transferSessionContext.environment,
        hybridDelegator: context.hybridDelegator as Address,
        recipient: ADMIN_ADDRESS,
        amountInput: nativeAmountInput,
        logPrefix: `[dual/${normalizedMode}]`,
      });

      // Ensure swap delegation allowlist contains WMON and DAK (append if missing)
      const allowedTokens = swapSession.allowedTokens ?? [];
      const wmonToken = findToken(allowedTokens, (token) => token.address.toLowerCase() === MONAD_WMON_ADDRESS.toLowerCase());
      if (!wmonToken) {
        console.log(chalk.yellow("WMON not present in delegation scope; wrap/transfer will be skipped."));
      }

      const dakInScope = findToken(allowedTokens, (token) => token.address.toLowerCase() === DAK_ADDRESS.toLowerCase());
      if (!dakInScope) {
        console.log(chalk.yellow("DAK not present in delegation scope; ERC-20 transfer will be skipped."));
      }

      if (wmonToken && dakInScope) {
        const wrapAmountInput = erc20 ?? "0.05";
        await wrapNativeWithSession({
          session: swapSession,
          environment: context.environment,
          hybridDelegator: context.hybridDelegator as Address,
          amountInput: wrapAmountInput,
          logPrefix: `[dual/${normalizedMode}]`,
        });

        await transferTokenWithSession({
          session: swapSession,
          environment: context.environment,
          hybridDelegator: context.hybridDelegator as Address,
          recipient: ADMIN_ADDRESS,
          token: dakInScope,
          amountInput: wrapAmountInput,
          logPrefix: `[dual/${normalizedMode}]`,
        });
      } else {
        console.log(
          chalk.yellow(
            "Delegation scope lacks WMON and/or DAK; ERC-20 transfer test not executed. Reissue delegation with required tokens.",
          ),
        );
      }

      const delegatorBalance = await publicClient.getBalance({ address: context.hybridDelegator });
      const sessionBalance = await publicClient.getBalance({ address: transferSession.sessionKeyAddress });
      console.log(
        chalk.gray(
          `[dual/${normalizedMode}] Final balances — delegator: ${formatEther(delegatorBalance)} MON · session key: ${formatEther(sessionBalance)} MON`,
        ),
      );

      console.log(chalk.green(`[dual/${normalizedMode}] Transfer dual test completed for ${context.hybridDelegator}.`));
    });
};
