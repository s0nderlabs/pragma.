import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { getAddress, parseUnits, formatUnits } from "viem";

import { loadSwapSession } from "../services/swapArtifacts.js";
import { transferTokenWithSession } from "../services/transferEngine.js";
import type { AllowedToken } from "../services/monorailTokens.js";
import { createMonadPublicClient } from "../services/web3authClients.js";

interface TransferTokenOptions {
  delegator?: string;
  token?: string;
  amount?: string;
  recipient?: string;
}

const tokenLabel = (token: AllowedToken) =>
  `${token.symbol ?? token.address} (${token.address})`;

const pickToken = async (allowedTokens: AllowedToken[]): Promise<AllowedToken> => {
  if (allowedTokens.length === 1) {
    return allowedTokens[0];
  }

  const choices = allowedTokens.map((token) => ({
    name: tokenLabel(token),
    value: token.address,
  }));

  const { selected } = await inquirer.prompt<{ selected: string }>([
    {
      type: "list",
      name: "selected",
      message: "Select token to transfer",
      choices,
    },
  ]);

  const match = allowedTokens.find((token) => token.address.toLowerCase() === selected.toLowerCase());
  if (!match) {
    throw new Error("Selected token not found in delegation allowlist.");
  }
  return match;
};

const findToken = (allowedTokens: AllowedToken[], tokenInput?: string): AllowedToken | undefined => {
  if (!tokenInput) return undefined;
  const normalized = tokenInput.trim().toLowerCase();
  return allowedTokens.find((token) =>
    token.address.toLowerCase() === normalized || (token.symbol && token.symbol.toLowerCase() === normalized),
  );
};

const validateAmount = (input: string, decimals: number) => {
  try {
    const parsed = parseUnits(input.trim(), decimals);
    return parsed > 0n ? true : "Amount must be greater than zero";
  } catch {
    return "Enter a valid decimal amount";
  }
};

export const registerTransferToken = (program: Command) => {
  program
    .command("transfer:token")
    .description("Transfer an ERC-20 token authorised in the delegation scope")
    .option("--delegator <address>", "HybridDelegator to use when multiple delegations exist")
    .option("--token <symbolOrAddress>", "Token symbol or address to transfer")
    .option("--amount <value>", "Token amount to transfer")
    .option("--recipient <address>", "Recipient address for the transfer")
    .action(async ({ delegator, token, amount, recipient }: TransferTokenOptions) => {
      const context = await loadSwapSession({ delegator });
      const { session, environment, allowedTokens, delegatorAddress, artifactPath } = context;

      if (!session) {
        throw new Error("Swap delegation not found. Run onboarding before attempting token transfers.");
      }

      const now = Math.floor(Date.now() / 1000);
      if (session.expiresAt <= now) {
        throw new Error(
          `Delegation stored at ${artifactPath} has expired. Reissue the delegation before transferring tokens.`,
        );
      }

      if (!allowedTokens || allowedTokens.length === 0) {
        throw new Error("Delegation allowlist is empty. Update delegation tokens before transferring.");
      }

      let selectedToken = findToken(allowedTokens, token);
      if (!selectedToken) {
        selectedToken = await pickToken(allowedTokens);
      }

      const decimals = typeof selectedToken.decimals === "number" ? selectedToken.decimals : Number(selectedToken.decimals ?? 18);

      let amountInput: string;
      if (!amount) {
        const { amountPrompt } = await inquirer.prompt<{ amountPrompt: string }>([
          {
            type: "input",
            name: "amountPrompt",
            message: `Amount of ${selectedToken.symbol ?? selectedToken.address} to transfer`,
            default: "0.01",
            validate: (value: string) => validateAmount(value, decimals),
          },
        ]);
        amountInput = amountPrompt.trim();
      } else {
        const validation = validateAmount(amount, decimals);
        if (validation !== true) {
          throw new Error(validation);
        }
        amountInput = amount;
      }

      let resolvedRecipient = recipient ? getAddress(recipient) : undefined;
      if (!resolvedRecipient) {
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
        resolvedRecipient = getAddress(recipientPrompt.trim());
      }

      const publicClient = createMonadPublicClient();
      const balance = await publicClient.readContract({
        address: getAddress(selectedToken.address),
        abi: [
          {
            type: "function",
            name: "balanceOf",
            stateMutability: "view",
            inputs: [{ name: "account", type: "address" }],
            outputs: [{ name: "", type: "uint256" }],
          },
        ] as const,
        functionName: "balanceOf",
        args: [delegatorAddress],
      }) as bigint;

      console.log(
        chalk.gray(
          `Delegator ${delegatorAddress} balance: ${formatUnits(balance, decimals)} ${
            selectedToken.symbol ?? selectedToken.address
          }`,
        ),
      );

      await transferTokenWithSession({
        session,
        environment,
        hybridDelegator: delegatorAddress,
        token: selectedToken,
        recipient: resolvedRecipient,
        amountInput,
        logPrefix: "[transfer]",
      });
    });
};
