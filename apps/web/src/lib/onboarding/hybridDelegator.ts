"use client";

import { http, getAddress, type Account, type Address, type Hex, type Transport, type WalletClient } from "viem";
import { createBundlerClient, type BundlerClient, type UserOperationRequest } from "viem/account-abstraction";
import { formatUserOperationRequest } from "viem/account-abstraction";
import {
  Implementation,
  toMetaMaskSmartAccount,
  getDeleGatorEnvironment,
} from "@metamask/delegation-toolkit";

import {
  createMonadPublicClient,
  monadChain,
  type MonadPublicClient,
  type WalletWithAddress,
} from "../../lib/clients";
import { MONAD_CHAIN_ID, PIMLICO_BUNDLER_URL } from "../../lib/config";
import { sponsorUserOperation, type PimlicoSponsorship } from "../../lib/pimlico";
import { fetchDelegatorNonce } from "@pragma/core/delegations/nonce";
import { buildSponsorRequest, applySponsorshipToUserOp, type SignableUserOperation } from "./paymasterUtils";

const coerceEstimate = (value?: string | null) => {
  if (!value) return undefined;
  try {
    const normalized = value.startsWith("0x") ? value : `0x${value}`;
    const parsed = BigInt(normalized);
    return parsed > 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const FALLBACK_VERIFICATION_GAS_LIMIT = 2_500_000n;
const FALLBACK_PRE_VERIFICATION_GAS = 120_000n;

const USER_OPERATION_WAIT_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_PRAGMA_USEROP_WAIT_TIMEOUT_MS ?? "2000",
);

const deployViaAdminFallback = async ({
  factory,
  factoryData,
  owner,
  delegator,
}: {
  factory: Hex;
  factoryData: Hex;
  owner: Address;
  delegator: Address;
}): Promise<{ transactionHash: Hex }> => {
  const response = await fetch("/api/onboarding/deploy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      factory,
      factoryData,
      owner,
      delegator,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Admin fallback deployment failed");
  }

  const payload = (await response.json()) as { transactionHash?: Hex; error?: string };
  if (!payload.transactionHash) {
    throw new Error(payload.error ?? "Admin fallback deployment failed");
  }
  return { transactionHash: payload.transactionHash };
};

export interface HybridDelegatorHandle {
  smartAccount: Awaited<ReturnType<typeof toMetaMaskSmartAccount>>;
  delegator: Address;
  environment: ReturnType<typeof getDeleGatorEnvironment>;
  publicClient: MonadPublicClient;
  bundlerClient: BundlerClient;
  owner: Address;
}

const OWNER_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "owner", type: "address" }],
  },
] as const;

export const createHybridDelegatorHandle = async (
  walletClient: WalletWithAddress["walletClient"],
  ownerAddress: Address,
): Promise<HybridDelegatorHandle> => {
  const publicClient = createMonadPublicClient();
  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    signer: { walletClient: walletClient as WalletClient<Transport, typeof monadChain, Account> },
    deployParams: [ownerAddress, [], [], []],
    deploySalt: "0x",
  });

  const bundlerClient = createBundlerClient({
    chain: monadChain,
    transport: http(PIMLICO_BUNDLER_URL),
    client: publicClient,
  });

  const address = await smartAccount.getAddress();
  if (!address) {
    throw new Error("Failed to resolve HybridDelegator address from smart account");
  }

  return {
    smartAccount,
    delegator: getAddress(address),
    environment: getDeleGatorEnvironment(MONAD_CHAIN_ID),
    publicClient,
    bundlerClient,
    owner: ownerAddress,
  };
};

export const isSmartAccountDeployed = async (handle: HybridDelegatorHandle): Promise<boolean> => {
  try {
    const reported = await handle.smartAccount.isDeployed?.();
    if (typeof reported === "boolean") {
      return reported;
    }
  } catch {
    // fall through to bytecode check
  }

  const bytecode = await handle.publicClient.getBytecode({ address: handle.delegator });
  return !!bytecode && bytecode !== "0x";
};

export const ensureHybridDelegatorDeployed = async (
  handle: HybridDelegatorHandle,
  options: { allowDirectFallback?: boolean } = {},
): Promise<{ userOpHash: Hex | null; transactionHash?: Hex } | undefined> => {
  const deployed = await isSmartAccountDeployed(handle);
  if (deployed) {
    return undefined;
  }

  const { smartAccount, bundlerClient, publicClient } = handle;

  const factoryArgs = await smartAccount.getFactoryArgs?.();
  if (!factoryArgs) {
    throw new Error("Unable to fetch factory args for HybridDelegator");
  }

  const nonce = (await smartAccount.getNonce?.()) ?? 0n;
  const feeEstimates = await publicClient.estimateFeesPerGas().catch(() => undefined);
  const gasPrice = await publicClient.getGasPrice();
  let maxPriorityFeePerGas = feeEstimates?.maxPriorityFeePerGas ?? gasPrice;
  let maxFeePerGas = feeEstimates?.maxFeePerGas ?? gasPrice + maxPriorityFeePerGas;

  const extendedBundler = bundlerClient as BundlerClient & {
    request: <T = unknown>(
      args: { method: string; params: unknown[] },
      options?: { retryCount?: number },
    ) => Promise<T>;
  };

  try {
    const suggestion = (await extendedBundler.request(
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

    const recommended = suggestion?.fast ?? suggestion?.standard ?? suggestion?.slow;
    if (recommended) {
      maxFeePerGas = BigInt(recommended.maxFeePerGas);
      maxPriorityFeePerGas = BigInt(recommended.maxPriorityFeePerGas);
    }
  } catch {
    // ignore price suggestion errors
  }

  const baseUserOp = {
    sender: handle.delegator,
    nonce,
    factory: factoryArgs.factory,
    factoryData: factoryArgs.factoryData,
    callData: "0x" as Hex,
    callGasLimit: 0n,
    verificationGasLimit: 0n,
    preVerificationGas: 0n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    signature: "0x" as Hex,
  };

  const userOp: SignableUserOperation = { ...baseUserOp };

  let sponsorship = await sponsorUserOperation({
    userOperation: buildSponsorRequest(baseUserOp as SignableUserOperation),
    entryPoint: smartAccount.entryPoint.address,
  });
  applySponsorshipToUserOp(userOp, sponsorship);

  let gasAdjusted = false;
  const setGasValue = (
    field: "callGasLimit" | "verificationGasLimit" | "preVerificationGas",
    value?: bigint,
  ) => {
    if (!value || value <= 0n) return;
    if (userOp[field] === value) return;
    userOp[field] = value;
    gasAdjusted = true;
  };

  if (!userOp.callGasLimit || userOp.callGasLimit === 0n || !userOp.verificationGasLimit || userOp.verificationGasLimit === 0n) {
    try {
      const estimationRequest = formatUserOperationRequest({
        ...userOp,
        signature: "0x" as Hex,
      } as unknown as UserOperationRequest);
      const estimation = (await extendedBundler.request(
        {
          method: "eth_estimateUserOperationGas",
          params: [estimationRequest, smartAccount.entryPoint.address],
        },
        { retryCount: 0 },
      )) as
        | {
            preVerificationGas?: string;
            verificationGas?: string;
            verificationGasLimit?: string;
            callGasLimit?: string;
          }
        | undefined;

      setGasValue("callGasLimit", coerceEstimate(estimation?.callGasLimit));
      setGasValue(
        "verificationGasLimit",
        coerceEstimate(estimation?.verificationGasLimit ?? estimation?.verificationGas),
      );
      setGasValue("preVerificationGas", coerceEstimate(estimation?.preVerificationGas));
    } catch (error) {
      console.warn("Failed to estimate HybridDelegator gas via bundler", error);
    }
  }

  if (!userOp.verificationGasLimit || userOp.verificationGasLimit === 0n) {
    console.warn(
      "Applying fallback verificationGasLimit for HybridDelegator deployment",
      Number(FALLBACK_VERIFICATION_GAS_LIMIT),
    );
    setGasValue("verificationGasLimit", FALLBACK_VERIFICATION_GAS_LIMIT);
  }
  if (!userOp.preVerificationGas || userOp.preVerificationGas === 0n) {
    setGasValue("preVerificationGas", FALLBACK_PRE_VERIFICATION_GAS);
  }

  if (gasAdjusted) {
    const desiredCallGasLimit = userOp.callGasLimit;
    const desiredVerificationGasLimit = userOp.verificationGasLimit;
    const desiredPreVerificationGas = userOp.preVerificationGas;

    sponsorship = await sponsorUserOperation({
      userOperation: buildSponsorRequest(userOp),
      entryPoint: smartAccount.entryPoint.address,
    });
    applySponsorshipToUserOp(userOp, sponsorship);
    if (desiredCallGasLimit && desiredCallGasLimit > 0n) {
      if (!userOp.callGasLimit || userOp.callGasLimit === 0n) {
        userOp.callGasLimit = desiredCallGasLimit;
      }
    }
    if (desiredVerificationGasLimit && desiredVerificationGasLimit > 0n) {
      if (!userOp.verificationGasLimit || userOp.verificationGasLimit === 0n) {
        userOp.verificationGasLimit = desiredVerificationGasLimit;
      }
    }
    if (desiredPreVerificationGas && desiredPreVerificationGas > 0n) {
      const current = userOp.preVerificationGas ?? 0n;
      if (desiredPreVerificationGas > current) {
        userOp.preVerificationGas = desiredPreVerificationGas;
      }
    }
    if (!userOp.preVerificationGas || userOp.preVerificationGas === 0n) {
      userOp.preVerificationGas = FALLBACK_PRE_VERIFICATION_GAS;
    }
  }

  const signature = await smartAccount.signUserOperation(userOp);
  const rpcUserOperation = formatUserOperationRequest({
    ...userOp,
    signature,
  } satisfies UserOperationRequest);

  const fetchUserOperationReceipt = async (hash: Hex) => {
    try {
      return (await extendedBundler.request(
        {
          method: "eth_getUserOperationReceipt",
          params: [hash],
        },
        { retryCount: 0 },
      )) as
        | {
            receipt?: { transactionHash?: string };
            transactionHash?: string;
          }
        | null;
    } catch {
      return null;
    }
  };

  const finalizeFromReceipt = async (
    hash: Hex,
    receipt?: { receipt?: { transactionHash?: string }; transactionHash?: string } | null,
  ) => {
    const txHash = receipt?.receipt?.transactionHash ?? receipt?.transactionHash;
    if (txHash && txHash !== "0x") {
      try {
        await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });
      } catch {
        // ignore wait failures; tx may already be indexed
      }
      return { userOpHash: hash, transactionHash: txHash as Hex };
    }
    return undefined;
  };

  let userOpHash: Hex | undefined;

  try {
    userOpHash = (await bundlerClient.request(
      {
        method: "eth_sendUserOperation",
        params: [rpcUserOperation, smartAccount.entryPoint.address],
      },
      { retryCount: 0 },
    )) as Hex;

    const waitWithTimeout = <T>(promise: Promise<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `Timed out waiting ${USER_OPERATION_WAIT_TIMEOUT_MS}ms for Pimlico receipt`,
            ),
          );
        }, USER_OPERATION_WAIT_TIMEOUT_MS);
        promise
          .then((value) => {
            clearTimeout(timer);
            resolve(value);
          })
          .catch((error) => {
            clearTimeout(timer);
            reject(error);
          });
      });

    const receipt = await waitWithTimeout(
      bundlerClient.waitForUserOperationReceipt({ hash: userOpHash }),
    );
    const finalized = await finalizeFromReceipt(userOpHash, receipt as { receipt?: { transactionHash?: string } });
    if (finalized) {
      return finalized;
    }

    const secondaryReceipt = await fetchUserOperationReceipt(userOpHash);
    const secondaryFinalized = await finalizeFromReceipt(userOpHash, secondaryReceipt);
    if (secondaryFinalized) {
      return secondaryFinalized;
    }

    throw new Error("Pimlico bundler response missing transaction hash");
  } catch (error) {
    const deployedAfterFailure = await isSmartAccountDeployed(handle).catch(() => false);
    if (userOpHash) {
      const fetched = await finalizeFromReceipt(userOpHash, await fetchUserOperationReceipt(userOpHash));
      if (fetched) {
        return fetched;
      }
    }
    if (deployedAfterFailure && userOpHash) {
      return { userOpHash, transactionHash: undefined };
    }

    if (!options.allowDirectFallback) {
      throw error;
    }

    const factory = factoryArgs.factory ? (factoryArgs.factory as Hex) : undefined;
    const factoryData = factoryArgs.factoryData ? (factoryArgs.factoryData as Hex) : undefined;
    if (!factory || !factoryData) {
      throw new Error("Factory arguments unavailable for fallback deployment");
    }

    try {
      const fallback = await deployViaAdminFallback({
        factory,
        factoryData,
        owner: handle.owner,
        delegator: handle.delegator,
      });
      return { userOpHash: null, transactionHash: fallback.transactionHash };
    } catch (fallbackError) {
      const deployedViaBundler = await isSmartAccountDeployed(handle).catch(() => false);
      if (deployedViaBundler) {
        return { userOpHash: userOpHash ?? null, transactionHash: undefined };
      }
      throw fallbackError;
    }
  }
};

export const fetchDelegationNonce = async (handle: HybridDelegatorHandle) =>
  fetchDelegatorNonce(handle.publicClient, handle.environment, handle.delegator);

export const fetchHybridDelegatorOwner = async (
  handle: HybridDelegatorHandle,
  retryCount = 0,
): Promise<Address | undefined> => {
  try {
    const owner = (await handle.publicClient.readContract({
      address: handle.delegator,
      abi: OWNER_ABI,
      functionName: "owner",
    })) as Address;
    return getAddress(owner);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTransientError = 
      errorMessage.includes("Block requested not found") ||
      errorMessage.includes("compute units") ||
      errorMessage.includes("rate limit");
    
    if (isTransientError && retryCount < 2) {
      console.log(`[Revoke] Transient RPC error, retrying... (attempt ${retryCount + 1}/2)`);
      await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
      return fetchHybridDelegatorOwner(handle, retryCount + 1);
    }
    
    if (!isTransientError) {
      console.warn("[Revoke] Failed to fetch delegator owner:", error);
    }
    
    return undefined;
  }
};
