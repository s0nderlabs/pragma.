import { Address, Hex, getAddress } from "viem";
import { getDeleGatorEnvironment } from "@metamask/delegation-toolkit";
import chalk from "chalk";

import {
  loadDelegationArtifact,
  loadLatestActiveDelegation,
  isDelegationExpired,
  diagnoseDelegationSignature,
} from "./delegationArtifacts.js";
import { createMonadPublicClient } from "./web3authClients.js";
import { MONAD_CHAIN_ID, MONAD_NATIVE_TOKEN_ADDRESS } from "./config.js";
import type { AllowedToken } from "./monorailTokens.js";
import type { SessionDelegationInfo } from "./onboarding4337.js";
import { DEFAULT_CALL_LIMITS } from "./onboarding4337.js";

export interface SwapSessionOptions {
  artifactPath?: string;
  delegator?: string;
}

export interface SwapSessionContext {
  session: SessionDelegationInfo;
  environment: ReturnType<typeof getDeleGatorEnvironment>;
  delegatorAddress: Address;
  allowedTokens: AllowedToken[];
  artifactPath: string;
}

const isNativeToken = (token: AllowedToken): boolean =>
  token.address.toLowerCase() === MONAD_NATIVE_TOKEN_ADDRESS.toLowerCase() || token.kind === "native";

export const describeAllowedTokens = (tokens: AllowedToken[]): string =>
  tokens
    .map((token) => {
      const symbol = token.symbol ?? token.address.slice(0, 6);
      return `${symbol} (${token.address})`;
    })
    .join(", ");

export const resolveSwapToken = (input: string, tokens: AllowedToken[]) => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Token identifier cannot be empty.");
  }
  const normalized = trimmed.toLowerCase();

  const matching = tokens.find((token) => {
    if (token.address.toLowerCase() === normalized) return true;
    if (token.symbol && token.symbol.toLowerCase() === normalized) return true;
    if (normalized === "mon" || normalized === "native") {
      return isNativeToken(token);
    }
    return false;
  });

  if (!matching) {
    throw new Error(
      `Token '${input}' is not part of the delegation allowlist. Allowed tokens: ${describeAllowedTokens(tokens)}.`,
    );
  }

  if (typeof matching.decimals !== "number" || Number.isNaN(matching.decimals)) {
    throw new Error(`Token metadata for ${matching.symbol ?? matching.address} is missing decimals.`);
  }

  return matching;
};

export const loadSwapSession = async ({ artifactPath, delegator }: SwapSessionOptions): Promise<SwapSessionContext> => {
  const normalizedDelegator = delegator ? getAddress(delegator) : undefined;
  const entry = artifactPath
    ? await loadDelegationArtifact(artifactPath)
    : await loadLatestActiveDelegation(normalizedDelegator);
  const artifact = entry.artifact;
  const filePath = entry.filePath;
  const delegatorAddress = getAddress(artifact.delegation.delegator);

  if (normalizedDelegator && delegatorAddress !== normalizedDelegator) {
    throw new Error(`Delegation artifact does not match requested delegator ${normalizedDelegator}.`);
  }

  if (isDelegationExpired(artifact)) {
    throw new Error(
      `Delegation stored at ${filePath} has expired. Reissue a delegation before swapping.`,
    );
  }

  if (!artifact.sessionKeyPrivateKey) {
    throw new Error(
      `Delegation artifact ${filePath} is missing the session key secret. Issue a fresh delegation before swapping.`,
    );
  }

  const allowedTokens = artifact.allowedTokens ?? [];
  if (allowedTokens.length === 0) {
    console.log(
      chalk.yellow(
        "Delegation allowlist is empty. Use `pragma delegation:update-tokens` to add swap targets before executing.",
      ),
    );
  }

  const publicClient = createMonadPublicClient();
  const environment = getDeleGatorEnvironment(MONAD_CHAIN_ID);

  const signatureCheck = await diagnoseDelegationSignature(publicClient, environment, artifact);
  if (!signatureCheck.valid) {
    const expected = signatureCheck.expectedSigner
      ? ` (expected owner ${signatureCheck.expectedSigner})`
      : "";
    const recovered = signatureCheck.recoveredSigner
      ? ` Signature was produced by ${signatureCheck.recoveredSigner}.`
      : "";
    throw new Error(
      `Stored delegation for ${delegatorAddress} failed validation${expected}.${recovered} Reissue the delegation before swapping.`,
    );
  }

  const callsUnlimited = artifact.callsUnlimited ?? false;
  const callLimit = callsUnlimited ? null : artifact.callLimit ?? DEFAULT_CALL_LIMITS[artifact.mode];

  const session: SessionDelegationInfo = {
    mode: artifact.mode,
    sessionKeyAddress: artifact.sessionKeyAddress as Address,
    sessionKeyPrivateKey: artifact.sessionKeyPrivateKey as Hex,
    delegation: artifact.delegation,
    expiresAt: artifact.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    callLimit,
    callsUnlimited,
    sessionNonce: (artifact.sessionNonce ?? "0x0") as Hex,
    allowedTokens,
  };

  return {
    session,
    environment,
    delegatorAddress,
    allowedTokens,
    artifactPath: filePath,
  };
};
