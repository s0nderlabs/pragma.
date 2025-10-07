import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { getAddress, parseEther, formatEther } from "viem";

import { loadTransferSession } from "../services/transferArtifacts.js";
import { transferNativeWithSession } from "../services/transferEngine.js";
import { MONAD_NATIVE_TOKEN_SYMBOL } from "../services/config.js";
import { createMonadPublicClient } from "../services/web3authClients.js";

interface TransferMonOptions {
  delegator?: string;
  recipient?: string;
  amount?: string;
}

const validateAmountInput = (input: string) => {
  try {
    const parsed = parseEther(input.trim());
    return parsed > 0n ? true : "Amount must be greater than zero";
  } catch {
    return "Enter a valid decimal amount";
  }
};

export const registerTransferMon = (program: Command) => {
  program
    .command("transfer:mon")
    .description("Transfer MON using the delegated session key")
    .option("--delegator <address>", "HybridDelegator to use when multiple delegations exist")
    .option("--recipient <address>", "Recipient address for the transfer")
    .option("--amount <mon>", "Amount of MON to transfer")
    .action(async (options: TransferMonOptions) => {
      const entry = await loadTransferSession({ delegator: options.delegator });
      const { session, environment, delegatorAddress, artifactPath } = entry;

      if (!session) {
        throw new Error("Transfer session not found. Run onboarding before attempting transfers.");
      }

      const now = Math.floor(Date.now() / 1000);
      if (session.expiresAt <= now) {
        throw new Error(
          `Delegation stored at ${artifactPath} has expired. Reissue the delegation before transferring MON.`,
        );
      }

      let amountInput: string;
      if (!options.amount) {
        const { amountPrompt } = await inquirer.prompt<{ amountPrompt: string }>([
          {
            type: "input",
            name: "amountPrompt",
            message: "Amount of MON to transfer",
            default: "0.01",
            validate: validateAmountInput,
          },
        ]);
        amountInput = amountPrompt.trim();
      } else {
        const validation = validateAmountInput(options.amount);
        if (validation !== true) {
          throw new Error(validation);
        }
        amountInput = options.amount;
      }

      let recipient = options.recipient ? getAddress(options.recipient) : undefined;
      if (!recipient) {
        const { recipientPrompt } = await inquirer.prompt<{ recipientPrompt: string }>([
          {
            type: "input",
            name: "recipientPrompt",
            message: "Recipient address",
            validate: (value: string) => {
              try {
                getAddress(value.trim());
                return true;
              } catch {
                return "Enter a valid address";
              }
            },
          },
        ]);
        recipient = getAddress(recipientPrompt.trim());
      }

      const publicClient = createMonadPublicClient();
      const delegatorBalance = await publicClient.getBalance({ address: delegatorAddress });
      console.log(
        chalk.gray(
          `Delegator ${delegatorAddress} balance before transfer: ${formatEther(delegatorBalance)} ${
            MONAD_NATIVE_TOKEN_SYMBOL ?? "MON"
          }`,
        ),
      );

      await transferNativeWithSession({
        session,
        environment,
        hybridDelegator: delegatorAddress,
        recipient,
        amountInput,
        logPrefix: "[transfer]",
      });
    });
};
