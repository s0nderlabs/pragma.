import chalk from "chalk";
import open from "open";
import ora from "ora";
import path from "node:path";
import { Address, Hex, http, getAddress } from "viem";
import { sepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  createDelegation,
  getDeleGatorEnvironment,
  Implementation,
  signDelegation,
  toMetaMaskSmartAccount,
} from "@metamask/delegation-toolkit";
import { createBundlerClient } from "viem/account-abstraction";
import { formatUserOperationRequest } from "viem/account-abstraction";
import type { Delegation } from "@metamask/delegation-toolkit";
import inquirer from "inquirer";

import { startWeb3AuthBridge } from "./web3authServer.js";
import { startPrivyBridge } from "./privyBridgeServer.js";
import { createSepoliaPublicClient, createWalletClientFromBridge } from "./web3authClients.js";
import { buildDelegationTypedData } from "./delegationTypedData.js";
import { sponsorUserOperation } from "./pimlico.js";

import { onboardingLogger } from "../utils/logger.js";
import {
  PIMLICO_BUNDLER_URL,
  PIMLICO_CHAIN,
  SEPOLIA_WETH_ADDRESS,
  SEPOLIA_UNI_ADDRESS,
  SEPOLIA_SWAP_ROUTER_ADDRESS,
  PRIVY_APP_ID,
  PRAGMA_IDENTITY_PROVIDER,
} from "./config.js";

export type Mode = "safe" | "normal";

export const ROUTER = getAddress(SEPOLIA_SWAP_ROUTER_ADDRESS);
const EXACT_INPUT_SINGLE_SELECTOR = "0x04e45aaf" as Hex;
const APPROVE_SELECTOR = "0x095ea7b3" as Hex;
export const WETH_SEPOLIA = getAddress(SEPOLIA_WETH_ADDRESS);
export const UNI_SEPOLIA = getAddress(SEPOLIA_UNI_ADDRESS);
export const ZERO_SALT = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

export type DeleGatorEnv = ReturnType<typeof getDeleGatorEnvironment>;

export interface DelegationArtifact {
  mode: Mode;
  sessionKeyPrivateKey: Hex;
  sessionKeyAddress: Address;
  delegation: Delegation;
  expiresAt: number;
}

export interface SessionDelegationInfo {
  mode: Mode;
  sessionKeyAddress: Address;
  sessionKeyPrivateKey: Hex;
  expiresAt: number;
  delegation: Delegation;
}

interface HybridTestContext {
  rootPrivateKey: Hex;
  rootAccount: ReturnType<typeof privateKeyToAccount>;
  hybridDelegator: Address;
  environment: ReturnType<typeof getDeleGatorEnvironment>;
  publicClient: ReturnType<typeof createSepoliaPublicClient>;
  sessionDelegations: SessionDelegationInfo[];
  deploymentInfo?: { userOpHash: Hex; transactionHash: Hex };
}

const TEST_DELEGATIONS_BASE_DIR = (process.env.PRAGMA_DELEGATION_DIR
  ? path.join(process.env.PRAGMA_DELEGATION_DIR)
  : path.join(process.env.HOME ?? ".", ".pragma", "test-delegations"));
const SESSION_KEY_FILENAME = "session-key.json";

export const saveDelegation = async (artifact: DelegationArtifact): Promise<string> => {
  const fs = await import("node:fs/promises");

  const delegatorAddress = getAddress(artifact.delegation.delegator);
  const delegatorDir = path.join(TEST_DELEGATIONS_BASE_DIR, delegatorAddress.toLowerCase());
  await fs.mkdir(delegatorDir, { recursive: true });

  try {
    const existing = await fs.readdir(delegatorDir);
    const historyFiles = existing
      .filter((name) => /^session-\d+\.json$/.test(name))
      .map((name) => ({
        name,
        timestamp: Number(name.match(/^session-(\d+)\.json$/)?.[1] ?? 0),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    const maxHistory = 5;
    while (historyFiles.length >= maxHistory) {
      const oldest = historyFiles.shift();
      if (!oldest) break;
      try {
        await fs.unlink(path.join(delegatorDir, oldest.name));
      } catch (error) {
        onboardingLogger.debug({ err: error, file: oldest.name }, "Failed to prune old delegation artifact");
      }
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      onboardingLogger.debug({ err: error }, "Unable to enumerate existing delegation artifacts");
    }
  }

  const file = path.join(delegatorDir, `session-${Date.now()}.json`);
  await fs.writeFile(file, JSON.stringify(artifact, null, 2));
  onboardingLogger.info({ file, delegator: delegatorAddress }, "Stored 4337 delegation artifact");
  return file;
};

export const generateSessionKey = (): { privateKey: Hex; address: Address } => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { privateKey, address: account.address };
};

export interface SessionKeyRecord {
  address: Address;
  privateKey: Hex;
  filePath: string;
  isNew: boolean;
}

export const getOrCreateSessionKey = async (delegator: Address): Promise<SessionKeyRecord> => {
  const fs = await import("node:fs/promises");
  const normalizedDelegator = getAddress(delegator);
  const delegatorDir = path.join(TEST_DELEGATIONS_BASE_DIR, normalizedDelegator.toLowerCase());
  await fs.mkdir(delegatorDir, { recursive: true });

  const keyPath = path.join(delegatorDir, SESSION_KEY_FILENAME);
  try {
    const raw = await fs.readFile(keyPath, "utf8");
    const stored = JSON.parse(raw) as {
      sessionKeyPrivateKey?: string;
      sessionKeyAddress?: string;
      privateKey?: string;
      address?: string;
    };
    const storedPrivateKey = (stored.sessionKeyPrivateKey ?? stored.privateKey) as Hex | undefined;
    const storedAddress = stored.sessionKeyAddress ?? stored.address;
    if (storedPrivateKey && storedAddress) {
      const account = privateKeyToAccount(storedPrivateKey);
      const resolvedAddress = getAddress(storedAddress);
      if (account.address.toLowerCase() === resolvedAddress.toLowerCase()) {
        return {
          privateKey: storedPrivateKey,
          address: resolvedAddress,
          filePath: keyPath,
          isNew: false,
        };
      }
      onboardingLogger.warn(
        { resolvedAddress, storedAddress },
        "Persisted session key address mismatch; regenerating",
      );
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      onboardingLogger.warn({ err: error }, "Failed reading persisted session key; regenerating");
    }
  }

  const fresh = generateSessionKey();
  const payload = {
    sessionKeyAddress: fresh.address,
    sessionKeyPrivateKey: fresh.privateKey,
    createdAt: Date.now(),
  };
  await fs.writeFile(keyPath, JSON.stringify(payload, null, 2));
  onboardingLogger.info(
    { file: keyPath, delegator: normalizedDelegator },
    "Persisted new session key for delegator",
  );
  return { ...fresh, filePath: keyPath, isNew: true };
};

const clearPersistedSessionArtifacts = async (delegator: Address) => {
  const fs = await import("node:fs/promises");
  const normalizedDelegator = getAddress(delegator);
  const delegatorDir = path.join(TEST_DELEGATIONS_BASE_DIR, normalizedDelegator.toLowerCase());
  const keyPath = path.join(delegatorDir, SESSION_KEY_FILENAME);

  try {
    await fs.unlink(keyPath);
    onboardingLogger.info({ file: keyPath, delegator: normalizedDelegator }, "Removed persisted session key");
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      onboardingLogger.warn({ err: error, file: keyPath }, "Failed to remove persisted session key");
    }
  }

  try {
    const entries = await fs.readdir(delegatorDir);
    await Promise.all(
      entries
        .filter((name) => /^session-\d+\.json$/.test(name))
        .map(async (name) => {
          try {
            await fs.unlink(path.join(delegatorDir, name));
          } catch (error) {
            onboardingLogger.debug({ err: error, file: name }, "Failed to remove session delegation artifact during rotation");
          }
        }),
    );
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      onboardingLogger.debug({ err: error, delegator: normalizedDelegator }, "Failed to enumerate delegation artifacts during rotation");
    }
  }
};

export const buildScope = (delegator: Address) => ({
  type: "functionCall" as const,
  targets: [ROUTER, WETH_SEPOLIA],
  selectors: [EXACT_INPUT_SINGLE_SELECTOR, APPROVE_SELECTOR],
  allowedCalldata: [],
});

export const buildCaveats = (
  _environment: ReturnType<typeof getDeleGatorEnvironment>,
  mode: Mode,
  expiresAt: number,
) => [
  {
    type: "timestamp" as const,
    afterThreshold: 0,
    beforeThreshold: expiresAt,
  },
  {
    type: "nonce" as const,
    nonce: "0x0" as Hex,
  },
];

const submitHybridDelegatorDeployment = async ({
  smartAccount,
  bundlerClient,
  chainId,
  publicClient,
}: {
  smartAccount: Awaited<ReturnType<typeof toMetaMaskSmartAccount>>;
  bundlerClient: ReturnType<typeof createBundlerClient>;
  chainId: number;
  publicClient: ReturnType<typeof createSepoliaPublicClient>;
}): Promise<{ userOpHash: Hex; transactionHash: Hex }> => {
  const sender = await smartAccount.getAddress();
  const nonce = (await smartAccount.getNonce?.()) ?? 0n;
  const factoryArgs = await smartAccount.getFactoryArgs?.();
  if (!factoryArgs) {
    throw new Error("Unable to fetch factory args for HybridDelegator");
  }

  const feeEstimates = await publicClient.estimateFeesPerGas().catch(() => undefined);
  const gasPrice = await publicClient.getGasPrice();
  let maxPriorityFeePerGas = feeEstimates?.maxPriorityFeePerGas ?? gasPrice;
  let maxFeePerGas = feeEstimates?.maxFeePerGas ?? gasPrice + maxPriorityFeePerGas;

  try {
    const gasPriceSuggestion = (await bundlerClient.request(
      {
        method: "pimlico_getUserOperationGasPrice",
        params: [],
      },
      { retryCount: 0 },
    )) as
      | {
          fast?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
          standard?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
          slow?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
        }
      | undefined;

    const recommended = gasPriceSuggestion?.fast ?? gasPriceSuggestion?.standard ?? gasPriceSuggestion?.slow;
    if (recommended) {
      maxFeePerGas = BigInt(recommended.maxFeePerGas);
      maxPriorityFeePerGas = BigInt(recommended.maxPriorityFeePerGas);
    }
  } catch (error) {
    onboardingLogger.debug({ err: error }, "Failed to fetch Pimlico gas price suggestion");
  }

  const baseUserOp = {
    sender,
    nonce,
    factory: factoryArgs.factory,
    factoryData: factoryArgs.factoryData,
    callData: "0x",
    callGasLimit: 0n,
    verificationGasLimit: 0n,
    preVerificationGas: 0n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    signature: "0x",
  } as any;

  const formattedBase = formatUserOperationRequest(baseUserOp);
  const sponsorship = await sponsorUserOperation({
    userOperation: formattedBase,
    entryPoint: smartAccount.entryPoint.address,
  });

  const userOp = {
    ...baseUserOp,
    callGasLimit: sponsorship.callGasLimit ?? baseUserOp.callGasLimit,
    verificationGasLimit: sponsorship.verificationGasLimit ?? baseUserOp.verificationGasLimit,
    preVerificationGas: sponsorship.preVerificationGas ?? baseUserOp.preVerificationGas,
    paymasterPostOpGasLimit:
      sponsorship.paymasterPostOpGasLimit ?? baseUserOp.paymasterPostOpGasLimit,
    paymasterVerificationGasLimit:
      sponsorship.paymasterVerificationGasLimit ?? baseUserOp.paymasterVerificationGasLimit,
    paymaster:
      sponsorship.paymaster ?? (`0x${sponsorship.paymasterAndData.slice(2, 42)}` as Hex),
    paymasterData:
      sponsorship.paymasterData ?? (`0x${sponsorship.paymasterAndData.slice(42)}` as Hex),
  } as any;

  const signature = await smartAccount.signUserOperation(userOp);
  const rpcUserOperation = formatUserOperationRequest({
    ...userOp,
    signature,
  } as any);

  const userOpHash = (await bundlerClient.request(
    {
      method: "eth_sendUserOperation",
      params: [rpcUserOperation, smartAccount.entryPoint.address],
    },
    { retryCount: 0 },
  )) as Hex;

  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });
  const transactionHash = receipt.receipt?.transactionHash as Hex | undefined;
  if (!transactionHash || transactionHash === "0x") {
    throw new Error("Pimlico bundler response missing transaction hash");
  }

  return { userOpHash, transactionHash };
};

const isSmartAccountDeployed = async ({
  smartAccount,
  publicClient,
  address,
}: {
  smartAccount: Awaited<ReturnType<typeof toMetaMaskSmartAccount>>;
  publicClient: ReturnType<typeof createSepoliaPublicClient>;
  address: Address;
}): Promise<boolean> => {
  try {
    const reported = await smartAccount.isDeployed?.();
    if (typeof reported === "boolean") {
      return reported;
    }
  } catch (error) {
    onboardingLogger.debug({ err: error }, "smartAccount.isDeployed failed; falling back to bytecode check");
  }

  const bytecode = await publicClient.getBytecode({ address });
  return !!bytecode && bytecode !== "0x";
};

export interface RunOnboardOptions {
  rotateSessionKey?: boolean;
  expectedDelegator?: Address;
}

export const runOnboard4337 = async (
  modeHint?: Mode,
  identityHint?: "privy" | "web3auth",
  options: RunOnboardOptions = {},
) => {
  onboardingLogger.debug({ chain: PIMLICO_CHAIN }, "Using Pimlico bundler & paymaster endpoints");

  const environment = getDeleGatorEnvironment(sepolia.id);
  let sessionKey!: SessionKeyRecord;
  let expiresAt = 0;
  let hybridDelegator: Address | undefined;
  let mode: Mode;

  const rotateSessionKey = options.rotateSessionKey ?? false;
  const expectedDelegator = options.expectedDelegator ? getAddress(options.expectedDelegator) : undefined;

  const normalizedHint = identityHint;
  const requestedIdentity = PRAGMA_IDENTITY_PROVIDER?.toLowerCase();
  const envIdentity =
    requestedIdentity === "web3auth"
      ? "web3auth"
      : requestedIdentity === "privy"
        ? "privy"
        : undefined;

  const identityProvider: "privy" | "web3auth" = normalizedHint ?? envIdentity ?? "web3auth";

  if (identityProvider === "privy" && !PRIVY_APP_ID) {
    throw new Error(
      "PRIVY_ID environment variable must be set to use the Privy identity provider (set PRAGMA_IDENTITY_PROVIDER=web3auth to force Web3Auth).",
    );
  }

  onboardingLogger.info({ identityProvider, source: normalizedHint ? "cli" : envIdentity ? "env" : "auto" }, "Using wallet identity bridge");

  if (identityProvider === "web3auth" && !normalizedHint && !envIdentity && !PRIVY_APP_ID) {
    onboardingLogger.info("PRIVY_ID not configured; falling back to Web3Auth");
  }

  const bridge =
    identityProvider === "privy"
      ? startPrivyBridge({
          onReady: async (url) => {
            onboardingLogger.info({ url }, "Launching Privy handoff");
            await open(url, { wait: false });
          },
        })
      : startWeb3AuthBridge(async (url) => {
          onboardingLogger.info({ url }, "Launching Web3Auth handoff");
          await open(url, { wait: false });
        });

  try {
    const { address: registeredAddress } = await bridge.waitForWallet();
    const { walletClient, address: derivedAddress } = await createWalletClientFromBridge(
      bridge,
      registeredAddress,
    );
    const rootAddress = derivedAddress;

    onboardingLogger.info(
      { root: rootAddress, reported: registeredAddress, identityProvider },
      "Identity wallet connected",
    );

    const publicClient = createSepoliaPublicClient();

    const smartAccount = await toMetaMaskSmartAccount({
      client: publicClient,
      implementation: Implementation.Hybrid,
      signer: { walletClient: walletClient as any },
      deployParams: [rootAddress, [], [], []],
      deploySalt: "0x",
    });

    const bundlerClient = createBundlerClient({
      chain: sepolia,
      transport: http(PIMLICO_BUNDLER_URL),
      client: publicClient,
      account: smartAccount,
    } as any);

    hybridDelegator = await smartAccount.getAddress();

    const alreadyDeployed = await isSmartAccountDeployed({
      smartAccount,
      publicClient,
      address: hybridDelegator,
    });

    let existingOwner: Address | undefined;
    if (alreadyDeployed) {
      try {
        existingOwner = (await publicClient.readContract({
          address: hybridDelegator,
          abi: [
            {
              type: "function",
              name: "owner",
              stateMutability: "view",
              inputs: [],
              outputs: [{ name: "owner", type: "address" }],
            },
          ] as const,
          functionName: "owner",
        })) as Address;
      } catch {
        existingOwner = undefined;
      }
    }
    let deploymentInfo: { userOpHash: Hex; transactionHash: Hex } | undefined;

    if (alreadyDeployed) {
      if (existingOwner && existingOwner !== rootAddress) {
        console.log(
          chalk.red(
            `Connected Web3Auth wallet ${rootAddress} is not the owner of HybridDelegator ${hybridDelegator}.`,
          ),
        );
        console.log(
          chalk.yellow(
            `Reconnect with the original owner account (${existingOwner}) or update ownership before issuing a delegation.`,
          ),
        );
        return;
      }
      onboardingLogger.info({ hybridDelegator }, "HybridDelegator already deployed for user");
      const { continueWithExisting } = await inquirer.prompt<{ continueWithExisting: boolean }>([
        {
          type: "confirm",
          name: "continueWithExisting",
          message: `HybridDelegator already deployed at ${hybridDelegator}. Reuse existing account?`,
          default: true,
        },
      ]);

      if (!continueWithExisting) {
        console.log(chalk.yellow("Onboarding cancelled — retaining existing HybridDelegator."));
        return;
      }

      console.log(chalk.green("Reusing previously deployed HybridDelegator."));
    } else {
      const { confirmDeployment } = await inquirer.prompt<{ confirmDeployment: boolean }>([
        {
          type: "confirm",
          name: "confirmDeployment",
          message: `Deploy HybridDelegator smart account for ${rootAddress}?`,
          default: true,
        },
      ]);

      if (!confirmDeployment) {
        console.log(chalk.yellow("Deployment aborted by user."));
        return;
      }

      const ensureDeployedSpinner = ora("Deploying HybridDelegator (Pimlico sponsored)").start();
      try {
        const { userOpHash, transactionHash } = await submitHybridDelegatorDeployment({
          smartAccount,
          bundlerClient,
          chainId: sepolia.id,
          publicClient,
        });
        onboardingLogger.info({ userOpHash, transactionHash }, "HybridDelegator deployment submitted");
        ensureDeployedSpinner.succeed(
          `HybridDelegator deployed (userOp: ${userOpHash}, tx: ${transactionHash})`,
        );
        deploymentInfo = { userOpHash, transactionHash };
      } catch (error) {
        ensureDeployedSpinner.fail("HybridDelegator deployment failed");
        throw error;
      }
    }

    if (deploymentInfo) {
      console.log(`UserOperation hash: ${deploymentInfo.userOpHash}`);
      console.log(`Transaction hash: ${deploymentInfo.transactionHash}`);
    }

    const normalizedDelegator = getAddress(hybridDelegator as Address);
    if (expectedDelegator && normalizedDelegator !== expectedDelegator) {
      console.log(
        chalk.red(
          `Connected HybridDelegator ${normalizedDelegator} does not match expected delegator ${expectedDelegator}. Aborting.`,
        ),
      );
      return;
    }

    if (rotateSessionKey) {
      await clearPersistedSessionArtifacts(normalizedDelegator);
    }

    sessionKey = await getOrCreateSessionKey(hybridDelegator as Address);
    if (rotateSessionKey && !sessionKey.isNew) {
      throw new Error("Failed to rotate session key; existing key persisted on disk.");
    }
    if (sessionKey.isNew) {
      console.log(
        chalk.green(
          `Created session key ${sessionKey.address}. Fund this address once and it will be reused for future delegations.`,
        ),
      );
    } else {
      console.log(
        chalk.green(
          `Reusing existing session key ${sessionKey.address}. Top-ups carry across new delegations.`,
        ),
      );
    }

    let selectedMode = modeHint;
    if (selectedMode) {
      const { confirmMode } = await inquirer.prompt<{ confirmMode: boolean }>([
        {
          type: "confirm",
          name: "confirmMode",
          message: `Use ${selectedMode} mode for delegation?`,
          default: true,
        },
      ]);
      if (!confirmMode) selectedMode = undefined;
    }

    if (!selectedMode) {
      const { modeChoice } = await inquirer.prompt<{ modeChoice: Mode }>([
        {
          type: "list",
          name: "modeChoice",
          message: "Select delegation mode",
          choices: [
            { name: "Safe (pair scoped, tighter limits)", value: "safe" },
            { name: "Normal (curated list, broader limits)", value: "normal" },
          ],
          default: "safe",
        },
      ]);
      selectedMode = modeChoice;
    }

    mode = selectedMode;
    const ttlSeconds = mode === "safe" ? 3600 : 24 * 3600;

    const before = Math.floor(Date.now() / 1000) + ttlSeconds;
    expiresAt = before;

    const scope = buildScope(hybridDelegator as Address);
    const caveats = buildCaveats(environment, mode, before);

    const delegationWithoutSignature = createDelegation({
      environment,
      scope,
      from: hybridDelegator as Hex,
      to: sessionKey.address as Hex,
      caveats,
      salt: ZERO_SALT,
    });

    const typedData = buildDelegationTypedData(
      delegationWithoutSignature,
      sepolia.id,
      environment.DelegationManager as Address,
    );

    const signResult = await bridge.signTypedData({
      typedDataJson: JSON.stringify(typedData),
      from: rootAddress,
    });

    if (signResult.recoveredAddress && signResult.recoveredAddress.toLowerCase() !== rootAddress.toLowerCase()) {
      throw new Error(
        `Delegation signature produced by ${signResult.recoveredAddress}, expected owner ${rootAddress}.` +
          " Ensure Web3Auth is connected with the original owner account.",
      );
    }

    const signedDelegation: Delegation = {
      ...delegationWithoutSignature,
      signature: signResult.signature as Hex,
    };

    await saveDelegation({
      mode,
      sessionKeyPrivateKey: sessionKey.privateKey,
      sessionKeyAddress: sessionKey.address,
      delegation: signedDelegation,
      expiresAt,
    });

    const limit = mode === "safe" ? 1 : 3;
    const expiryIso = new Date(expiresAt * 1000).toISOString();

    console.log(chalk.green(`Delegation stored for session key ${sessionKey.address}`));
    console.log(`  • Purpose         : swap permissions via Uniswap V3 router ${ROUTER}`);
    console.log(`  • Selector        : exactInputSingle (${EXACT_INPUT_SINGLE_SELECTOR})`);
    console.log("  • Allowed targets  : WETH (approve) and Uniswap V3 router (swap)");
    console.log(
      "  • Allowed selectors: approve(address,uint256), exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))",
    );
    console.log(`  • Session window  : valid until ${expiryIso}`);
    console.log(`  • Call allowance  : ${limit} swap${limit > 1 ? "s" : ""} before expiry`);
    console.log("  • Nonce guard      : single-use (nonce pinned at 0x0)");
    console.log(`  • Session key      : ${sessionKey.address}`);
    console.log(`  • Session secret   : ${sessionKey.privateKey}`);
    console.log(`  • Delegator        : ${signedDelegation.delegator}`);
    console.log("  • Signature        : delegation signed via Web3Auth wallet session\n");

    console.log(chalk.green("4337 onboarding flow complete"));
    console.log(`Root wallet: ${rootAddress}`);
    console.log(`HybridDelegator: ${hybridDelegator ?? "unknown"}`);
    console.log(`Session key: ${sessionKey.address}`);
    console.log(`Delegation TTL target: ${expiryIso}`);
  } finally {
    await bridge.shutdown();
  }
};

export const setupHybridDelegatorTest = async (
  modeSelection: "safe" | "normal" | "both",
  { logSessionSummaries = true }: { logSessionSummaries?: boolean } = {},
): Promise<HybridTestContext> => {
  const publicClient = createSepoliaPublicClient();
  const rootPrivateKey = generatePrivateKey();
  const rootAccount = privateKeyToAccount(rootPrivateKey);

  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    signer: { account: rootAccount },
    deployParams: [rootAccount.address, [], [], []],
    deploySalt: "0x",
  });

  const bundlerClient = createBundlerClient({
    chain: sepolia,
    transport: http(PIMLICO_BUNDLER_URL),
    client: publicClient,
    account: smartAccount,
  } as any);

  const hybridDelegator = await smartAccount.getAddress();

  const spinner = ora("Deploying HybridDelegator on Sepolia (test)").start();
  let deploymentInfo: { userOpHash: Hex; transactionHash: Hex } | undefined;
  try {
    const deployed = await isSmartAccountDeployed({
      smartAccount,
      publicClient,
      address: hybridDelegator,
    });
    if (!deployed) {
      const { userOpHash, transactionHash } = await submitHybridDelegatorDeployment({
        smartAccount,
        bundlerClient,
        chainId: sepolia.id,
        publicClient,
      });
      onboardingLogger.info({ userOpHash, transactionHash }, "Test deployment submitted");
      spinner.succeed(
        `HybridDelegator deployed (userOp: ${userOpHash}, tx: ${transactionHash})`,
      );
      deploymentInfo = { userOpHash, transactionHash };
    } else {
      spinner.succeed("HybridDelegator already deployed (test)");
    }
  } catch (error) {
    spinner.fail("HybridDelegator deployment failed (test)");
    throw error;
  }

  const environment = getDeleGatorEnvironment(sepolia.id);
  const modes =
    modeSelection === "both" ? (["safe", "normal"] as const) : ([modeSelection] as const);

  const sessionDelegations: SessionDelegationInfo[] = [];

  for (const mode of modes) {
    const ttlSeconds = mode === "safe" ? 3600 : 24 * 3600;
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

    const sessionKey = generateSessionKey();
    const scope = buildScope(hybridDelegator as Address);
    const caveats = buildCaveats(environment, mode, expiresAt);

    const delegationWithoutSignature = createDelegation({
      environment,
      scope,
      from: hybridDelegator as Hex,
      to: sessionKey.address as Hex,
      caveats,
      salt: ZERO_SALT,
    });

    const { signature: _unusedSignature, ...delegationToSign } = delegationWithoutSignature;
    const signature = await signDelegation({
      privateKey: rootPrivateKey,
      delegation: delegationToSign,
      delegationManager: environment.DelegationManager as Address,
      chainId: sepolia.id,
    });

    const signedDelegation: Delegation = {
      ...delegationWithoutSignature,
      signature: signature as Hex,
    };

    await saveDelegation({
      mode,
      sessionKeyPrivateKey: sessionKey.privateKey,
      sessionKeyAddress: sessionKey.address,
      delegation: signedDelegation,
      expiresAt,
    });

    const delegationInfo: SessionDelegationInfo = {
      mode,
      sessionKeyAddress: sessionKey.address,
      sessionKeyPrivateKey: sessionKey.privateKey,
      expiresAt,
      delegation: signedDelegation,
    };
    sessionDelegations.push(delegationInfo);

    if (logSessionSummaries) {
      const limit = mode === "safe" ? 1 : 3;
      const expiryIso = new Date(expiresAt * 1000).toISOString();

      console.log(chalk.green(`[${mode}] Delegation ready for session key ${sessionKey.address}`));
      console.log(`  • Purpose         : swap permissions via Uniswap V3 router ${ROUTER}`);
      console.log(`  • Selector        : exactInputSingle (${EXACT_INPUT_SINGLE_SELECTOR})`);
      console.log("  • Allowed targets  : WETH (approve) and Uniswap V3 router (swap)");
      console.log(
        "  • Allowed selectors: approve(address,uint256), exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))",
      );
      console.log(`  • Session window  : valid until ${expiryIso}`);
      console.log(`  • Call allowance  : ${limit} swap${limit > 1 ? "s" : ""} before expiry`);
      console.log("  • Nonce guard      : single-use (nonce pinned at 0x0)");
      console.log(`  • Session key      : ${sessionKey.address}`);
      console.log(`  • Session secret   : ${sessionKey.privateKey}`);
      console.log(`  • Delegator        : ${signedDelegation.delegator}`);
      console.log("  • Signature        : delegation signed with root test signer\n");
    }
  }

  return {
    rootPrivateKey,
    rootAccount,
    hybridDelegator,
    environment,
    publicClient,
    sessionDelegations,
    deploymentInfo,
  };
};

export const runOnboard4337Test = async (
  modeSelection: "safe" | "normal" | "both" = "both",
) => {
  onboardingLogger.info({ chain: PIMLICO_CHAIN }, "Running 4337 onboarding test");

  const context = await setupHybridDelegatorTest(modeSelection, { logSessionSummaries: true });

  console.log(chalk.green("4337 test onboarding complete"));
  console.log(`Root signer: ${context.rootAccount.address}`);
  console.log(`Root private key: ${context.rootPrivateKey}`);
  console.log(`HybridDelegator: ${context.hybridDelegator}`);
  if (context.deploymentInfo) {
    console.log(`UserOperation hash: ${context.deploymentInfo.userOpHash}`);
    console.log(`Transaction hash: ${context.deploymentInfo.transactionHash}`);
  }

  console.log("Delegation explanations printed above. Artifacts are in-memory only for this test run.");
};
