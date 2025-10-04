import { Command } from "commander";
import chalk from "chalk";
import { Hex, parseEther, getAddress, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import { getDeleGatorEnvironment } from "@metamask/delegation-toolkit";

import {
  loadDelegationArtifact,
  loadLatestActiveDelegation,
  isDelegationExpired,
  diagnoseDelegationSignature,
} from "../services/delegationArtifacts.js";
import { createSepoliaPublicClient } from "../services/web3authClients.js";
import { DeleGatorEnv, SessionDelegationInfo, DEFAULT_CALL_LIMITS } from "../services/onboarding4337.js";
import { wrapNativeWithSession } from "../services/swapTest.js";
import { SEPOLIA_RPC_URL } from "../services/config.js";

export const registerWrap = (program: Command) => {
  program
    .command("wrap")
    .description("Wrap native ETH held by the HybridDelegator into WETH using the stored session key")
    .requiredOption("--amount <eth>", "Amount of ETH to wrap")
    .option("--artifact <path>", "Path to delegation artifact (defaults to latest active)")
    .option("--delegator <address>", "Specific HybridDelegator when multiple exist")
    .action(async ({
      artifact: artifactPath,
      delegator,
      amount,
    }: {
      artifact?: string;
      delegator?: string;
      amount: string;
    }) => {
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
      const filePath = entry.filePath;
      const delegatorAddress = getAddress(artifact.delegation.delegator);

      if (normalizedDelegator && delegatorAddress !== normalizedDelegator) {
        console.error(chalk.red(`Delegation artifact does not match requested delegator ${normalizedDelegator}.`));
        process.exit(1);
      }

      if (isDelegationExpired(artifact)) {
        console.error(
          chalk.red(
            `Delegation from ${filePath} has expired. Issue a new delegation with \`pragma delegation:issue\` before wrapping.`,
          ),
        );
        process.exit(1);
      }

      if (!artifact.sessionKeyPrivateKey) {
        console.error(
          chalk.red(
            `Delegation artifact ${filePath} is missing the session key secret. Issue a fresh delegation before wrapping.`,
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
        process.exit(1);
      }

      const ethBalance = await publicClient.getBalance({ address: delegatorAddress });
      if (ethBalance < parsedAmount) {
        console.error(
          chalk.red(
            `HybridDelegator has insufficient ETH (${formatEther(ethBalance)}). Fund it before attempting to wrap.`,
          ),
        );
        process.exit(1);
      }

      const callsUnlimited = artifact.callsUnlimited ?? false;
      const callLimit = callsUnlimited ? null : artifact.callLimit ?? DEFAULT_CALL_LIMITS[artifact.mode];
      const sessionNonce = (artifact.sessionNonce ?? "0x0") as Hex;

      const session: SessionDelegationInfo = {
        mode: artifact.mode,
        sessionKeyAddress: artifact.sessionKeyAddress,
        sessionKeyPrivateKey: artifact.sessionKeyPrivateKey as Hex,
        delegation: artifact.delegation,
        expiresAt: artifact.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
        callLimit,
        callsUnlimited,
        sessionNonce,
      };

      const sessionAccount = privateKeyToAccount(session.sessionKeyPrivateKey as Hex);
      const sessionWallet = createWalletClient({
        chain: sepolia,
        transport: http(SEPOLIA_RPC_URL),
        account: sessionAccount,
      });

      try {
        await wrapNativeWithSession({
          publicClient,
          sessionWallet,
          session,
          environment,
          hybridDelegator: delegatorAddress,
          amount: parsedAmount,
          logPrefix: "[wrap]",
        });
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
