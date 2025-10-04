import { Command } from "commander";
import chalk from "chalk";
import { Address, Hex, parseEther, getAddress } from "viem";
import { sepolia } from "viem/chains";
import { getDeleGatorEnvironment } from "@metamask/delegation-toolkit";

import {
  loadDelegationArtifact,
  isDelegationExpired,
  loadLatestActiveDelegation,
  diagnoseDelegationSignature,
} from "../services/delegationArtifacts.js";
import { createSepoliaPublicClient } from "../services/web3authClients.js";
import { DeleGatorEnv, SessionDelegationInfo, DEFAULT_CALL_LIMITS } from "../services/onboarding4337.js";
import { executeSwapWithSession, resolveSwapAsset, SwapIntent } from "../services/swapTest.js";

const DEFAULT_SLIPPAGE_BPS = 50n; // 0.50%
const DEFAULT_FROM = "weth";
const DEFAULT_TO = "uni";

const SUPPORTED_PAIRS: Array<[string, string]> = [
  ["weth", "uni"],
  ["uni", "weth"],
  ["eth", "uni"],
  ["uni", "eth"],
];

const normalizeAssetId = (raw: string) => raw.toLowerCase();

const ensureSupportedPair = (from: string, to: string) => {
  const normalizedFrom = normalizeAssetId(from);
  const normalizedTo = normalizeAssetId(to);
  const match = SUPPORTED_PAIRS.some(([lhs, rhs]) => lhs === normalizedFrom && rhs === normalizedTo);
  if (!match) {
    throw new Error(
      `Unsupported asset pair ${from} -> ${to}. Supported pairs: ${SUPPORTED_PAIRS.map((pair) => pair.join("->")).join(", ")}.`,
    );
  }
  return { from: normalizedFrom, to: normalizedTo };
};

export const registerSwap = (program: Command) => {
  program
    .command("swap")
    .description("Execute a delegated swap using the stored session key (supports native ETH ↔ UNI ↔ WETH)")
    .requiredOption("--amount <value>", "Amount to swap (interpreted in the source asset's decimals)")
    .option("--from <asset>", "Source asset: eth | weth | uni", DEFAULT_FROM)
    .option("--to <asset>", "Destination asset: eth | weth | uni", DEFAULT_TO)
    .option("--artifact <path>", "Path to delegation artifact (defaults to latest active)")
    .option("--delegator <address>", "Specific HybridDelegator when multiple exist")
    .option(
      "--slippage-bps <bps>",
      "Slippage tolerance in basis points",
      (value) => BigInt(value),
      DEFAULT_SLIPPAGE_BPS,
    )
    .action(
      async ({
        artifact: artifactPath,
        delegator,
        amount,
        from,
        to,
        slippageBps,
      }: {
        artifact?: string;
        delegator?: string;
        amount: string;
        from: string;
        to: string;
        slippageBps: bigint;
      }) => {
        const parsedAmount = parseEther(amount);
        if (parsedAmount <= 0n) {
          console.error(chalk.red("Amount must be greater than zero."));
          process.exit(1);
        }
        if (slippageBps <= 0n) {
          console.error(chalk.red("Slippage must be positive."));
          process.exit(1);
        }

        let normalizedPair: { from: string; to: string };
        try {
          normalizedPair = ensureSupportedPair(from, to);
        } catch (error) {
          console.error(chalk.red((error as Error).message));
          process.exit(1);
        }

        let intent: SwapIntent;
        try {
          intent = {
            from: resolveSwapAsset(normalizedPair.from),
            to: resolveSwapAsset(normalizedPair.to),
          };
        } catch (error) {
          console.error(chalk.red((error as Error).message));
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

        const callsUnlimited = artifact.callsUnlimited ?? false;
        const callLimit = callsUnlimited ? null : artifact.callLimit ?? DEFAULT_CALL_LIMITS[artifact.mode];
        const sessionNonce = (artifact.sessionNonce ?? "0x0") as Hex;

        const session: SessionDelegationInfo = {
          mode: artifact.mode,
          sessionKeyAddress: artifact.sessionKeyAddress as Address,
          sessionKeyPrivateKey: artifact.sessionKeyPrivateKey as Hex,
          delegation: artifact.delegation,
          expiresAt: artifact.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
          callLimit,
          callsUnlimited,
          sessionNonce,
        };

        try {
          await executeSwapWithSession({
            publicClient,
            hybridDelegator: delegatorAddress,
            session,
            environment,
            amountIn: parsedAmount,
            slippageBps,
            intent,
            logPrefix: "[swap]",
          });
        } catch (error) {
          console.error(chalk.red((error as Error).message));
          process.exit(1);
        }
      },
    );
};
