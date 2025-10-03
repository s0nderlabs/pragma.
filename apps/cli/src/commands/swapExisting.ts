import { Command } from "commander";
import chalk from "chalk";
import { Address, Hex } from "viem";
import { sepolia } from "viem/chains";
import { createDelegation, getDeleGatorEnvironment, signDelegation } from "@metamask/delegation-toolkit";

import {
  buildCaveats,
  buildScope,
  generateSessionKey,
  saveDelegation,
  Mode,
} from "../services/onboarding4337.js";
import { loadDelegationArtifact, isDelegationExpired } from "../services/delegationArtifacts.js";
import { createSepoliaPublicClient } from "../services/web3authClients.js";
import { executeSwapWithSession } from "../services/swapTest.js";
import { onboardingLogger } from "../utils/logger.js";
import { SessionDelegationInfo } from "../services/onboarding4337.js";
import { Delegation } from "@metamask/delegation-toolkit";

const MODE_TTLS: Record<Mode, number> = {
  safe: 3600,
  normal: 24 * 3600,
};

const normalizeHex = (value: string): Hex =>
  (value.startsWith("0x") ? value : `0x${value}`) as Hex;

const buildSessionInfo = (
  delegation: Delegation,
  artifactMode: Mode,
  sessionKeyAddress: string,
  sessionKeyPrivateKey: Hex,
  expiresAt: number,
): SessionDelegationInfo => ({
  mode: artifactMode,
  sessionKeyAddress: sessionKeyAddress as Address,
  sessionKeyPrivateKey,
  expiresAt,
  delegation,
});

const renewDelegation = async (
  hybridDelegator: Address,
  mode: Mode,
  rootKey: Hex,
): Promise<{ session: SessionDelegationInfo; artifactPath: string }> => {
  const environment = getDeleGatorEnvironment(sepolia.id);
  const sessionKey = generateSessionKey();
  const ttl = MODE_TTLS[mode] ?? MODE_TTLS.safe;
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;

  const scope = buildScope(hybridDelegator);
  const caveats = buildCaveats(environment, mode, expiresAt);

  const unsignedDelegation = createDelegation({
    environment,
    scope,
    from: hybridDelegator as Hex,
    to: sessionKey.address as Hex,
    caveats,
    salt: "0x0",
  });

  const { signature: _unused, ...delegationToSign } = unsignedDelegation;
  const signature = await signDelegation({
    privateKey: rootKey,
    delegation: delegationToSign,
    delegationManager: environment.DelegationManager as Hex,
    chainId: sepolia.id,
  });

  const signedDelegation: Delegation = {
    ...unsignedDelegation,
    signature: signature as Hex,
  };

  const artifactPath = await saveDelegation({
    mode,
    sessionKeyPrivateKey: sessionKey.privateKey,
    sessionKeyAddress: sessionKey.address,
    delegation: signedDelegation,
    expiresAt,
  });

  const session = buildSessionInfo(
    signedDelegation,
    mode,
    sessionKey.address,
    sessionKey.privateKey,
    expiresAt,
  );

  return { session, artifactPath };
};

export const registerSwapReuse = (program: Command) => {
  program
    .command("swap:test:reuse")
    .description(
      "[dev] Run the swap playground using the latest stored delegation without redeploying the HybridDelegator",
    )
    .option("--artifact <path>", "Path to a delegation artifact (defaults to latest under ~/.pragma)")
    .option(
      "--root-key <hex>",
      "Owner private key to refresh the delegation when expired (defaults to PRAGMA_DEV_OWNER_PK)",
    )
    .action(async ({ artifact, rootKey }: { artifact?: string; rootKey?: string }) => {
      try {
        const { artifact: stored, filePath } = await loadDelegationArtifact(artifact);
        const hybridDelegator = stored.delegation.delegator as Address;
        const mode = stored.mode;
        const expiresAt = stored.expiresAt;

        let session: SessionDelegationInfo = buildSessionInfo(
          stored.delegation,
          mode,
          stored.sessionKeyAddress,
          stored.sessionKeyPrivateKey,
          expiresAt,
        );

        if (isDelegationExpired(stored)) {
          const suppliedRoot = rootKey ?? process.env.PRAGMA_DEV_OWNER_PK;
          if (!suppliedRoot) {
            console.log(
              chalk.red(
                `Delegation in ${filePath} has expired and no root private key was provided. Pass --root-key or set PRAGMA_DEV_OWNER_PK to refresh it.`,
              ),
            );
            return;
          }

          const normalizedRoot = normalizeHex(suppliedRoot);
          const { session: renewedSession, artifactPath } = await renewDelegation(
            hybridDelegator,
            mode,
            normalizedRoot,
          );
          session = renewedSession;
          console.log(chalk.green(`Delegation refreshed and stored at ${artifactPath}`));
        } else {
          console.log(
            chalk.green(
              `Reusing delegation from ${filePath} (expires ${new Date(session.expiresAt * 1000).toISOString()})`,
            ),
          );
        }

        const publicClient = createSepoliaPublicClient();

        const environment = getDeleGatorEnvironment(sepolia.id);
        await executeSwapWithSession({
          publicClient,
          hybridDelegator: hybridDelegator as Address,
          session,
          environment,
        });
      } catch (error) {
        onboardingLogger.error({ err: error }, "swap:test:reuse failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
