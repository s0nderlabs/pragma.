import chalk from "chalk";
import open from "open";
import ora from "ora";
import { Address, Hex, encodeFunctionData, getAddress, toHex, http } from "viem";
import { createBundlerClient } from "viem/account-abstraction";
import { getDeleGatorEnvironment, Implementation, toMetaMaskSmartAccount } from "@metamask/delegation-toolkit";

import {
  loadDelegationArtifact,
  loadLatestActiveDelegation,
  type LoadedDelegationArtifact,
} from "./delegationArtifacts.js";
import { createMonadPublicClient, createWalletClientFromBridge, monadChain } from "./web3authClients.js";
import { fetchDelegatorNonce, type Mode } from "./onboarding4337.js";
import { startWeb3AuthBridge } from "./web3authServer.js";
import { startPrivyBridge } from "./privyBridgeServer.js";
import { onboardingLogger } from "../utils/logger.js";
import { PRIVY_APP_ID, PRAGMA_IDENTITY_PROVIDER, PIMLICO_BUNDLER_URL, MONAD_CHAIN_ID } from "./config.js";

const createBundlerClientUnsafe = (...args: any[]) => (createBundlerClient as any)(...args);

const OWNER_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "owner", type: "address" }],
  },
] as const;

const NONCE_ENFORCER_ABI = [
  {
    type: "function",
    name: "currentNonce",
    stateMutability: "view",
    inputs: [
      { name: "delegationManager", type: "address" },
      { name: "delegator", type: "address" },
    ],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
  {
    type: "function",
    name: "incrementNonce",
    stateMutability: "nonpayable",
    inputs: [{ name: "delegationManager", type: "address" }],
    outputs: [],
  },
] as const;

const DELEGATION_MANAGER_DISABLE_ABI = [
  {
    type: "function",
    name: "disableDelegation",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "delegation",
        type: "tuple",
        components: [
          { name: "delegate", type: "address" },
          { name: "delegator", type: "address" },
          { name: "authority", type: "bytes32" },
          {
            name: "caveats",
            type: "tuple[]",
            components: [
              { name: "enforcer", type: "address" },
              { name: "terms", type: "bytes" },
              { name: "args", type: "bytes" },
            ],
          },
          { name: "salt", type: "uint256" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export interface RunRevokeOptions {
  mode?: Mode;
  delegator?: string;
  artifactPath?: string;
  disableOnly?: boolean;
  alsoDisable?: boolean;
  identityHint?: "privy" | "web3auth";
}

interface SelectedDelegation {
  entry: LoadedDelegationArtifact;
  delegator: Address;
}

const selectDelegation = async (
  opts: Omit<RunRevokeOptions, "identityHint">,
): Promise<SelectedDelegation> => {
  if (opts.disableOnly && !opts.artifactPath) {
    throw new Error("--disable-only requires an explicit --artifact path to target.");
  }

  if (opts.artifactPath) {
    const loaded = await loadDelegationArtifact(opts.artifactPath);
    const delegator = getAddress(loaded.artifact.delegation.delegator);
    if (opts.mode && loaded.artifact.mode !== opts.mode) {
      onboardingLogger.warn(
        { expected: opts.mode, actual: loaded.artifact.mode },
        "Selected artifact mode differs from requested mode",
      );
    }
    return { entry: loaded, delegator };
  }

  const loaded = await loadLatestActiveDelegation(opts.delegator, opts.mode, "swap");
  const delegator = getAddress(loaded.artifact.delegation.delegator);
  return { entry: loaded, delegator };
};

const verifyOwner = async (
  delegator: Address,
  publicClient: ReturnType<typeof createMonadPublicClient>,
): Promise<Address | undefined> => {
  try {
    return (await publicClient.readContract({
      address: delegator,
      abi: OWNER_ABI,
      functionName: "owner",
    })) as Address;
  } catch {
    return undefined;
  }
};

export const runRevoke = async (options: RunRevokeOptions) => {
  const { mode, disableOnly = false, alsoDisable = false, identityHint } = options;
  onboardingLogger.info({ mode: mode ?? "auto", disableOnly, alsoDisable }, "Starting delegation revoke");

  const environment = getDeleGatorEnvironment(MONAD_CHAIN_ID);
  const nonceEnforcerAddress = environment.caveatEnforcers?.NonceEnforcer;
  if (!nonceEnforcerAddress) {
    throw new Error("NonceEnforcer address missing from environment; cannot revoke delegations.");
  }

  const { entry, delegator } = await selectDelegation(options);
  const artifact = entry.artifact;
  const artifactPath = entry.filePath;

  const publicClient: any = createMonadPublicClient();
  const currentOwner = await verifyOwner(delegator, publicClient);

  const envIdentity = (() => {
    const configured = PRAGMA_IDENTITY_PROVIDER?.toLowerCase();
    if (configured === "privy") return "privy" as const;
    if (configured === "web3auth") return "web3auth" as const;
    return undefined;
  })();
  const provider: "privy" | "web3auth" = identityHint ?? envIdentity ?? "web3auth";

  if (provider === "privy" && !PRIVY_APP_ID) {
    throw new Error(
      "PRIVY_ID environment variable must be set to use the Privy identity provider. Specify --web3auth to override.",
    );
  }

  const bridge =
    provider === "privy"
      ? startPrivyBridge({
          onReady: async (url) => {
            onboardingLogger.info({ url }, "Launching Privy handoff for revoke");
            await open(url, { wait: false });
          },
        })
      : startWeb3AuthBridge(async (url) => {
          onboardingLogger.info({ url }, "Launching Web3Auth handoff for revoke");
          await open(url, { wait: false });
        });

  try {
    const { address: reportedAddress } = await bridge.waitForWallet();
    const { walletClient, address: derivedAddress } = await createWalletClientFromBridge(bridge, reportedAddress);
    const rootAddress = getAddress(derivedAddress);

    onboardingLogger.info(
      { root: rootAddress, reported: reportedAddress, provider },
      "Identity wallet connected for revoke",
    );

    if (currentOwner && currentOwner.toLowerCase() !== rootAddress.toLowerCase()) {
      throw new Error(
        `Connected wallet ${rootAddress} is not the owner of HybridDelegator ${delegator}. Expected owner ${currentOwner}.`,
      );
    }

    const nonceBefore = await fetchDelegatorNonce(publicClient, environment, delegator);

    const smartAccount = (await toMetaMaskSmartAccount({
      client: publicClient,
      implementation: Implementation.Hybrid,
      signer: { walletClient: walletClient as any },
      address: delegator,
      environment,
    })) as any;

  // @ts-ignore - viem types currently expect 'account' to be undefined literal.
  // @ts-ignore -- upstream viem typings expect stricter generics; runtime invocation is valid.
  const bundlerConfig: any = {
    chain: monadChain,
    transport: http(PIMLICO_BUNDLER_URL),
    client: publicClient,
  };
  // @ts-ignore -- upstream viem typings expect stricter generics; runtime invocation is valid.
  const bundlerClient = createBundlerClientUnsafe(bundlerConfig);

    const calls: { to: Address; data: Hex; value?: bigint }[] = [];

    if (!disableOnly) {
      const incrementData = encodeFunctionData({
        abi: NONCE_ENFORCER_ABI,
        functionName: "incrementNonce",
        args: [environment.DelegationManager as Address],
      });
      calls.push({ to: nonceEnforcerAddress as Address, data: incrementData });
    }

    if ((alsoDisable || disableOnly) && !entry.artifact.delegation) {
      throw new Error("Unable to locate delegation payload to disable.");
    }

    if (disableOnly || (alsoDisable && entry.artifact.delegation)) {
      const delegationStruct = {
        ...entry.artifact.delegation,
        salt: BigInt(entry.artifact.delegation.salt),
      };
      const disableData = encodeFunctionData({
        abi: DELEGATION_MANAGER_DISABLE_ABI,
        functionName: "disableDelegation",
        args: [delegationStruct],
      });
      calls.push({ to: environment.DelegationManager as Address, data: disableData });
    }

    if (calls.length === 0) {
      console.log(chalk.yellow("Nothing to revoke; no actions requested."));
      return;
    }

    const spinner = ora("Submitting delegator user operation").start();
    let userOpHash: Hex;
    try {
      userOpHash = await bundlerClient.sendUserOperation({
        calls,
        entryPointAddress: environment.EntryPoint as Address,
      });
      spinner.text = `UserOperation submitted (${userOpHash})`;
      const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });
      const txHash = receipt.receipt?.transactionHash;
      spinner.succeed(`Delegator transaction confirmed (tx: ${txHash ?? "unknown"})`);
    } catch (error) {
      spinner.fail("Failed to execute delegator user operation");
      throw error;
    }

    const nonceAfter = await fetchDelegatorNonce(publicClient, environment, delegator);

    console.log("\n" + chalk.green("Delegation revoke complete"));
    console.log(`  Delegator       : ${delegator}`);
    console.log(`  Previous nonce  : ${toHex(nonceBefore)}`);
    console.log(`  Current nonce   : ${toHex(nonceAfter)}`);
    console.log(`  Artifact source : ${artifactPath}`);
    if (!disableOnly) {
      console.log("\nIssue a fresh delegation to reactivate session permissions.");
    }
  } finally {
    await bridge.shutdown();
  }
};
