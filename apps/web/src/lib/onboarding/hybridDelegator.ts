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
import { sponsorUserOperation } from "../../lib/pimlico";
import { fetchDelegatorNonce } from "@pragma/core/delegations/nonce";

export interface HybridDelegatorHandle {
  smartAccount: Awaited<ReturnType<typeof toMetaMaskSmartAccount>>;
  delegator: Address;
  environment: ReturnType<typeof getDeleGatorEnvironment>;
  publicClient: MonadPublicClient;
  bundlerClient: BundlerClient;
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
): Promise<{ userOpHash: Hex; transactionHash: Hex } | undefined> => {
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

  try {
    const extendedBundler = bundlerClient as BundlerClient & {
      request: <T = unknown>(
        args: { method: string; params: unknown[] },
        options?: { retryCount?: number },
      ) => Promise<T>;
    };

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

  const formattedBase = formatUserOperationRequest(baseUserOp as unknown as UserOperationRequest);
  const sponsorship = await sponsorUserOperation({
    userOperation: formattedBase,
    entryPoint: smartAccount.entryPoint.address,
  });

  type SignableUserOperation = Parameters<typeof smartAccount.signUserOperation>[0];

  const userOp: SignableUserOperation = {
    ...baseUserOp,
    callGasLimit: sponsorship.callGasLimit ?? baseUserOp.callGasLimit ?? 0n,
    verificationGasLimit: sponsorship.verificationGasLimit ?? baseUserOp.verificationGasLimit ?? 0n,
    preVerificationGas: sponsorship.preVerificationGas ?? baseUserOp.preVerificationGas ?? 0n,
    paymasterPostOpGasLimit: sponsorship.paymasterPostOpGasLimit,
    paymasterVerificationGasLimit: sponsorship.paymasterVerificationGasLimit,
    paymaster:
      sponsorship.paymaster ?? (`0x${sponsorship.paymasterAndData.slice(2, 42)}` as Hex),
    paymasterData:
      sponsorship.paymasterData ?? (`0x${sponsorship.paymasterAndData.slice(42)}` as Hex),
  };

  const signature = await smartAccount.signUserOperation(userOp);
  const rpcUserOperation = formatUserOperationRequest({
    ...userOp,
    signature,
  } satisfies UserOperationRequest);

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

export const fetchDelegationNonce = async (handle: HybridDelegatorHandle) =>
  fetchDelegatorNonce(handle.publicClient, handle.environment, handle.delegator);

export const fetchHybridDelegatorOwner = async (
  handle: HybridDelegatorHandle,
): Promise<Address | undefined> => {
  try {
    const owner = (await handle.publicClient.readContract({
      address: handle.delegator,
      abi: OWNER_ABI,
      functionName: "owner",
    })) as Address;
    return getAddress(owner);
  } catch {
    return undefined;
  }
};
