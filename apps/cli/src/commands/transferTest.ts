import chalk from "chalk";
import { Command } from "commander";
import { privateKeyToAccount } from "viem/accounts";
import { Address, Hex, createWalletClient, formatEther, http, parseEther } from "viem";

import { setupHybridDelegatorTest } from "../services/onboarding4337.js";
import { loadTransferSession } from "../services/transferArtifacts.js";
import { transferNativeWithSession, transferTokenWithSession } from "../services/transferEngine.js";
import { wrapNativeWithSession } from "../services/swapEngine.js";
import { createMonadPublicClient, monadChain } from "../services/web3authClients.js";
import { MONAD_NATIVE_TOKEN_SYMBOL, MONAD_RPC_URL, PRAGMA_ADMIN_TEST_PK } from "../services/config.js";
import type { AllowedToken } from "../services/monorailTokens.js";
import { onboardingLogger } from "../utils/logger.js";

const MODES = ["safe", "normal"] as const;
type TransferMode = (typeof MODES)[number];

const findWrappedToken = (tokens: AllowedToken[]): AllowedToken | undefined =>
  tokens.find((token) => token.kind === "wrappedNative");

export const registerTransferTest = (program: Command) => {
  program
    .command("transfer:test")
    .description("[dev] Exercise native and ERC-20 delegated transfers on a fresh HybridDelegator")
    .option("--mode <mode>", "Delegation mode: safe | normal", "normal")
    .option("--amount <mon>", "Native MON amount to transfer", "0.01")
    .option("--token-amount <value>", "Wrapped token amount to transfer", "0.005")
    .action(async ({ mode, amount, tokenAmount }: { mode?: string; amount?: string; tokenAmount?: string }) => {
      const normalizedMode = (mode ?? "normal").toLowerCase();
      if (!MODES.includes(normalizedMode as TransferMode)) {
        console.error(chalk.red("Invalid mode. Use 'safe' or 'normal'."));
        process.exit(1);
      }

      if (!PRAGMA_ADMIN_TEST_PK) {
        console.error(
          chalk.red("PRAGMA_ADMIN_TEST_PK is required to fund the dev transfer test. Set it in the environment."),
        );
        process.exit(1);
      }

      const adminAccount = privateKeyToAccount(PRAGMA_ADMIN_TEST_PK as Hex);
      const adminWallet = createWalletClient({
        chain: monadChain,
        transport: http(MONAD_RPC_URL),
        account: adminAccount,
      });
      const publicClient = createMonadPublicClient();

      onboardingLogger.info({ mode: normalizedMode }, "Starting transfer test provisioning");
      const context = await setupHybridDelegatorTest(normalizedMode as TransferMode, { logSessionSummaries: true });
      const swapSession = context.sessionDelegations.find((entry) => entry.mode === normalizedMode && entry.kind !== "transfer");
      if (!swapSession) {
        console.error(chalk.red(`No swap delegation generated for mode ${normalizedMode}.`));
        process.exit(1);
      }

      const transferContext = await loadTransferSession({ delegator: context.hybridDelegator as Address });
      const transferSession = transferContext.session;

      const fundAmount = parseEther("0.05");
      const fundTx = await adminWallet.sendTransaction({ to: context.hybridDelegator, value: fundAmount });
      await publicClient.waitForTransactionReceipt({ hash: fundTx });
      console.log(
        chalk.green(
          `[dev/${normalizedMode}] Funded ${context.hybridDelegator} with ${formatEther(fundAmount)} ${
            MONAD_NATIVE_TOKEN_SYMBOL ?? "MON"
          } (tx: ${fundTx})`,
        ),
      );

      const sessionFunding = parseEther("0.05");
      const sessionFundTx = await adminWallet.sendTransaction({
        to: transferSession.sessionKeyAddress,
        value: sessionFunding,
      });
      await publicClient.waitForTransactionReceipt({ hash: sessionFundTx });
      console.log(
        chalk.green(
          `[dev/${normalizedMode}] Funded session key ${transferSession.sessionKeyAddress} with ${formatEther(sessionFunding)} ${
            MONAD_NATIVE_TOKEN_SYMBOL ?? "MON"
          } (tx: ${sessionFundTx})`,
        ),
      );

      const recipient = adminAccount.address;

      await transferNativeWithSession({
        session: transferSession,
        environment: transferContext.environment,
        hybridDelegator: context.hybridDelegator as Address,
        recipient,
        amountInput: amount ?? "0.01",
        logPrefix: `[dev/${normalizedMode}]`,
      });

      const wrappedToken = findWrappedToken(swapSession.allowedTokens ?? []);
      if (!wrappedToken) {
        console.error(
          chalk.red("Delegation does not include the wrapped native token. Reissue onboarding with WMON in scope."),
        );
        process.exit(1);
      }

      await wrapNativeWithSession({
        session: swapSession,
        environment: context.environment,
        hybridDelegator: context.hybridDelegator as Address,
        amountInput: tokenAmount ?? "0.01",
        logPrefix: `[dev/${normalizedMode}]`,
      });

      await transferTokenWithSession({
        session: swapSession,
        environment: context.environment,
        hybridDelegator: context.hybridDelegator as Address,
        recipient,
        token: wrappedToken,
        amountInput: tokenAmount ?? "0.005",
        logPrefix: `[dev/${normalizedMode}]`,
      });

      console.log(
        chalk.green(
          `[dev/${normalizedMode}] Transfer test complete for HybridDelegator ${context.hybridDelegator}. Native + wrapped transfers successful.`,
        ),
      );
    });
};
