import { Command } from "commander";
import chalk from "chalk";
import { Address, Hex, toHex, getAddress } from "viem";
import { sepolia } from "viem/chains";
import { createDelegation, getDeleGatorEnvironment, signDelegation } from "@metamask/delegation-toolkit";

import {
  buildCaveats,
  buildScope,
  saveDelegation,
  Mode,
  ZERO_SALT,
  fetchDelegatorNonce,
  DEFAULT_CALL_LIMITS,
  type DelegationArtifact,
  type AllowedToken,
  WETH_SEPOLIA,
  UNI_SEPOLIA,
  USDC_SEPOLIA,
  normalizeAllowedTokensList,
} from "../services/onboarding4337.js";
import { loadDelegationArtifact, isDelegationExpired } from "../services/delegationArtifacts.js";
import { createSepoliaPublicClient } from "../services/web3authClients.js";
import { executeSwapWithSession, resolveSwapAsset, TEST_SWAP_INPUT } from "../services/swapTest.js";
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
  callLimit: number | null,
  callsUnlimited: boolean,
  sessionNonce: Hex,
  allowedTokens: AllowedToken[],
): SessionDelegationInfo => ({
  mode: artifactMode,
  sessionKeyAddress: sessionKeyAddress as Address,
  sessionKeyPrivateKey,
  expiresAt,
  delegation,
  callLimit,
  callsUnlimited,
  sessionNonce,
  allowedTokens,
});

const renewDelegation = async (
  publicClient: ReturnType<typeof createSepoliaPublicClient>,
  environment: ReturnType<typeof getDeleGatorEnvironment>,
  hybridDelegator: Address,
  mode: Mode,
  existingArtifact: DelegationArtifact,
  rootKey: Hex,
): Promise<{ session: SessionDelegationInfo; artifactPath: string }> => {
  const ttl = MODE_TTLS[mode] ?? MODE_TTLS.safe;
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;

  if (!existingArtifact.sessionKeyAddress || !existingArtifact.sessionKeyPrivateKey) {
    throw new Error("Stored delegation artifact is missing session key secrets. Issue a new delegation instead.");
  }

  const callsUnlimited = existingArtifact.callsUnlimited ?? false;
  const defaultLimit = DEFAULT_CALL_LIMITS[mode];
  const callLimitValue = callsUnlimited ? undefined : existingArtifact.callLimit ?? defaultLimit;

  const allowedTokens: AllowedToken[] = (existingArtifact.allowedTokens ?? [])
    .map((token) => ({
      address: getAddress(token.address),
      symbol: token.symbol,
      decimals: token.decimals ?? 18,
    }));
  const pushIfMissing = (token: AllowedToken) => {
    if (!allowedTokens.some((existing) => existing.address.toLowerCase() === token.address.toLowerCase())) {
      allowedTokens.push(token);
    }
  };
  if (allowedTokens.length === 0) {
    pushIfMissing({ address: WETH_SEPOLIA, symbol: "WETH", decimals: 18 });
    pushIfMissing({ address: UNI_SEPOLIA, symbol: "UNI", decimals: 18 });
    if (mode === "normal") {
      pushIfMissing({ address: USDC_SEPOLIA, symbol: "USDC", decimals: 6 });
    }
  }

  const currentNonce = await fetchDelegatorNonce(publicClient, environment, hybridDelegator);
  const sessionNonceHex = toHex(currentNonce);

  const normalizedAllowedTokens = normalizeAllowedTokensList(allowedTokens);

  const scope = buildScope(normalizedAllowedTokens);
  const caveats = buildCaveats(environment, mode, expiresAt, {
    callLimit: callLimitValue,
    unlimitedCalls: callsUnlimited,
    nonce: currentNonce,
  });

  const unsignedDelegation = createDelegation({
    environment,
    scope,
    from: hybridDelegator as Hex,
    to: existingArtifact.sessionKeyAddress as Hex,
    caveats,
    salt: ZERO_SALT,
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
    sessionKeyPrivateKey: existingArtifact.sessionKeyPrivateKey,
    sessionKeyAddress: existingArtifact.sessionKeyAddress,
    delegation: signedDelegation,
    expiresAt,
    callLimit: callsUnlimited ? null : callLimitValue ?? null,
    callsUnlimited,
    sessionNonce: sessionNonceHex,
    allowedTokens: normalizedAllowedTokens,
  });

  const session = buildSessionInfo(
    signedDelegation,
    mode,
    existingArtifact.sessionKeyAddress,
    existingArtifact.sessionKeyPrivateKey,
    expiresAt,
    callsUnlimited ? null : callLimitValue ?? null,
    callsUnlimited,
    sessionNonceHex,
    normalizedAllowedTokens,
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

        const publicClient = createSepoliaPublicClient();
        const environment = getDeleGatorEnvironment(sepolia.id);

        const storedCallsUnlimited = stored.callsUnlimited ?? false;
        const defaultLimit = DEFAULT_CALL_LIMITS[mode];
        const storedCallLimit = storedCallsUnlimited ? null : stored.callLimit ?? defaultLimit;
        const storedNonce = (stored.sessionNonce ?? "0x0") as Hex;

        const baseAllowedTokens: AllowedToken[] = (stored.allowedTokens ?? []).map((token) => ({
          address: getAddress(token.address),
          symbol: token.symbol,
          decimals: token.decimals ?? 18,
        }));
        if (baseAllowedTokens.length === 0) {
          baseAllowedTokens.push({ address: WETH_SEPOLIA, symbol: "WETH", decimals: 18 });
          baseAllowedTokens.push({ address: UNI_SEPOLIA, symbol: "UNI", decimals: 18 });
          if (mode === "normal") {
            baseAllowedTokens.push({ address: USDC_SEPOLIA, symbol: "USDC", decimals: 6 });
          }
        }

        let session: SessionDelegationInfo = buildSessionInfo(
          stored.delegation,
          mode,
          stored.sessionKeyAddress,
          stored.sessionKeyPrivateKey,
          expiresAt,
          storedCallLimit,
          storedCallsUnlimited,
          storedNonce,
          baseAllowedTokens,
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
            publicClient,
            environment,
            hybridDelegator,
            mode,
            stored,
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
        await executeSwapWithSession({
          publicClient,
          hybridDelegator: hybridDelegator as Address,
          session,
          environment,
          amountIn: TEST_SWAP_INPUT,
          slippageBps: 50n,
          intent: {
            from: resolveSwapAsset("weth"),
            to: resolveSwapAsset("uni"),
          },
          logPrefix: "[dev]",
        });
      } catch (error) {
        onboardingLogger.error({ err: error }, "swap:test:reuse failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
};
