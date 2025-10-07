import { Command } from "commander";
import chalk from "chalk";
import { Address, Hex, createWalletClient, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { loadTransferSession } from "../services/transferArtifacts.js";
import { loadSwapSession } from "../services/swapArtifacts.js";
import { transferNativeWithSession } from "../services/transferEngine.js";
import type { Mode } from "../services/onboarding4337.js";
import { createMonadPublicClient, monadChain } from "../services/web3authClients.js";
import { MONAD_NATIVE_TOKEN_SYMBOL, MONAD_RPC_URL, PRAGMA_ADMIN_TEST_PK } from "../services/config.js";

interface Options {
  delegator?: string;
  mode?: Mode;
  amount?: string;
  recipient?: string;
  topup?: string;
}

export const registerTransferReuse = (program: Command) => {
  program
    .command("transfer:test:reuse")
    .description("[dev] Reuse existing transfer delegation to send native MON")
    .requiredOption("--delegator <address>", "HybridDelegator address to use")
    .option("--mode <mode>", "Delegation mode for swap session metadata", "normal")
    .option("--amount <mon>", "Native MON amount to transfer", "0.01")
    .option("--recipient <address>", "Recipient address (defaults to admin account)")
    .option("--topup <mon>", "Additional MON to fund the session key before transfer", "0.5")
    .action(async (opts: Options) => {
      const { delegator, amount, mode, recipient, topup } = opts;
      if (!delegator) {
        console.error(chalk.red("--delegator is required"));
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

      const transferSessionContext = await loadTransferSession({ delegator });
      const transferSession = transferSessionContext.session;
      const swapSessionContext = await loadSwapSession({ delegator });
      const hybridDelegator = transferSessionContext.delegatorAddress as Address;

      const sessionTopupMon = topup ? Number(topup) : 0;
      if (sessionTopupMon > 0) {
        const value = parseEther(sessionTopupMon.toString());
        const txHash = await adminWallet.sendTransaction({
          to: transferSession.sessionKeyAddress,
          value,
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(
          chalk.green(
            `[reuse] Funded session key ${transferSession.sessionKeyAddress} with ${formatEther(value)} ${
              MONAD_NATIVE_TOKEN_SYMBOL ?? "MON"
            } (tx: ${txHash})`,
          ),
        );
      }

      const targetRecipient = (recipient ?? adminAccount.address) as Address;
      await transferNativeWithSession({
        session: transferSession,
        environment: transferSessionContext.environment,
        hybridDelegator,
        recipient: targetRecipient,
        amountInput: amount ?? "0.01",
        logPrefix: "[reuse]",
      });

      // Surface balances for sanity
      const delegatorBalance = await publicClient.getBalance({ address: hybridDelegator });
      const sessionBalance = await publicClient.getBalance({ address: transferSession.sessionKeyAddress });
      console.log(
        chalk.gray(
          `[reuse] Post-transfer balances — delegator: ${formatEther(delegatorBalance)} MON, session key: ${formatEther(sessionBalance)} MON`,
        ),
      );

      console.log(
        chalk.green(
          `[reuse] Native transfer complete for HybridDelegator ${hybridDelegator}. Session key ${transferSession.sessionKeyAddress} reused successfully.`,
        ),
      );
    });
};
