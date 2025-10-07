import chalk from "chalk";
import { Address, Hex, getAddress } from "viem";
import { getDeleGatorEnvironment } from "@metamask/delegation-toolkit";

import {
  diagnoseDelegationSignature,
  isDelegationExpired,
  loadDelegationArtifact,
  loadLatestActiveDelegation,
} from "./delegationArtifacts.js";
import type { DeleGatorEnv, SessionDelegationInfo } from "./onboarding4337.js";
import { createMonadPublicClient } from "./web3authClients.js";
import { MONAD_CHAIN_ID } from "./config.js";

export interface TransferSessionOptions {
  artifactPath?: string;
  delegator?: string;
}

export interface TransferSessionContext {
  session: SessionDelegationInfo;
  environment: DeleGatorEnv;
  delegatorAddress: Address;
  artifactPath: string;
  maxAmount?: bigint | null;
}

export const loadTransferSession = async (
  options: TransferSessionOptions = {},
): Promise<TransferSessionContext> => {
  const normalizedDelegator = options.delegator ? getAddress(options.delegator) : undefined;
  const entry = options.artifactPath
    ? await loadDelegationArtifact(options.artifactPath)
    : await loadLatestActiveDelegation(normalizedDelegator, undefined, "transfer");

  const artifact = entry.artifact;
  const filePath = entry.filePath;
  const delegatorAddress = getAddress(artifact.delegation.delegator);

  if (normalizedDelegator && delegatorAddress !== normalizedDelegator) {
    throw new Error(`Delegation artifact does not match requested delegator ${normalizedDelegator}.`);
  }

  if (artifact.kind && artifact.kind !== "transfer") {
    throw new Error("Selected delegation artifact is not marked as a native transfer scope. Reissue onboarding first.");
  }

  if (isDelegationExpired(artifact)) {
    throw new Error(
      `Transfer delegation stored at ${filePath} has expired. Reissue a delegation before transferring native MON.
`);
  }

  if (!artifact.sessionKeyPrivateKey) {
    throw new Error(
      `Delegation artifact ${filePath} is missing the session key secret. Issue a fresh delegation before transferring.
`);
  }

  const environment = getDeleGatorEnvironment(MONAD_CHAIN_ID);
  const publicClient = createMonadPublicClient();

  const signatureCheck = await diagnoseDelegationSignature(publicClient, environment, artifact);
  if (!signatureCheck.valid) {
    const recovered = signatureCheck.recoveredSigner
      ? ` (signed by ${signatureCheck.recoveredSigner})`
      : "";
    throw new Error(
      `Stored transfer delegation for ${delegatorAddress} failed validation${recovered}. Reissue before transferring native MON.`,
    );
  }

  const transferMax = artifact.transferMaxAmount ? BigInt(artifact.transferMaxAmount) : null;

  const session: SessionDelegationInfo = {
    mode: artifact.mode,
    sessionKeyAddress: artifact.sessionKeyAddress as Address,
    sessionKeyPrivateKey: artifact.sessionKeyPrivateKey as Hex,
    delegation: artifact.delegation,
    expiresAt: artifact.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    callLimit: null,
    callsUnlimited: true,
    sessionNonce: (artifact.sessionNonce ?? "0x0") as Hex,
    allowedTokens: [],
    kind: "transfer",
    transferMaxAmount: transferMax,
  };

  if (transferMax === null) {
    console.log(
      chalk.gray(
        `[info] Native transfer delegation for ${delegatorAddress} does not specify a max amount; assuming unlimited while testing.`,
      ),
    );
  }

  return {
    session,
    environment,
    delegatorAddress,
    artifactPath: filePath,
    maxAmount: transferMax,
  };
};
