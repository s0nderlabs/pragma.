/**
 * H2 Onboarding Service
 *
 * Simplified onboarding for H2 - no persistent delegation creation.
 * Just deploy HybridDelegator and generate session key.
 *
 * Key Features:
 * - HybridDelegator deployment via UserOp with Pimlico paymaster sponsorship
 * - Works with unfunded Web3Auth/Privy EOA wallets (no MON required)
 * - NO delegation creation during onboarding
 * - Session key stored in session state (not separate files)
 * - Delegations created just-in-time per transaction (ephemeral)
 */

import chalk from "chalk";
import open from "open";
import ora from "ora";
import {
  Address,
  Hex,
  http,
  getAddress,
  createPublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  createBundlerClient,
  formatUserOperationRequest,
} from "viem/account-abstraction";
import {
  toMetaMaskSmartAccount,
  Implementation,
} from "@metamask/delegation-toolkit";

import { startWeb3AuthBridge } from "./web3authServer.js";
import { startPrivyBridge } from "./privyBridgeServer.js";
import { createMonadPublicClient, createWalletClientFromBridge, monadChain } from "./web3authClients.js";
import { saveH2Session, getOrCreateH2SessionKey, type H2SessionData } from "./sessionStore.js";
import { sponsorUserOperation, type PimlicoSponsorship } from "./pimlico.js";
import {
  PIMLICO_BUNDLER_URL,
  PRAGMA_IDENTITY_PROVIDER,
  MONAD_CHAIN_ID,
  MONAD_EXECUTION_RPC_URL,
  PRAGMA_ADMIN_TEST_PK,
} from "./config.js";

// ============================================================================
// Types
// ============================================================================

export interface H2OnboardingResult {
  ownerAddress: Address;
  hybridDelegator: Address;
  sessionKeyAddress: Address;
  sessionKeyPrivateKey: Hex;
  walletClient: any; // viem WalletClient
  bridge: any; // Web3Auth/Privy bridge - must stay alive for signing
  smartAccount: any; // DTK smart account instance (for UserOp-based session key funding)
  bundlerClient: any; // Bundler client (for UserOp-based session key funding)
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if smart account is deployed
 */
const isSmartAccountDeployed = async ({
  address,
  publicClient,
}: {
  address: Address;
  publicClient: ReturnType<typeof createMonadPublicClient>;
}): Promise<boolean> => {
  try {
    const bytecode = await publicClient.getBytecode({ address });
    return !!bytecode && bytecode !== "0x";
  } catch {
    return false;
  }
};

/**
 * Deploy HybridDelegator via sponsored UserOp
 * Uses Pimlico paymaster to sponsor deployment (user doesn't need MON in EOA)
 */
const deployHybridDelegator = async ({
  smartAccount,
  bundlerClient,
  publicClient,
  hybridDelegator,
}: {
  smartAccount: any;
  bundlerClient: ReturnType<typeof createBundlerClient>;
  publicClient: ReturnType<typeof createMonadPublicClient>;
  hybridDelegator: Address;
}): Promise<Hex> => {
  const factoryArgs = await smartAccount.getFactoryArgs?.();
  if (!factoryArgs) {
    throw new Error("Unable to fetch factory args for HybridDelegator deployment");
  }

  // Get nonce
  const nonce = (await smartAccount.getNonce?.()) ?? 0n;

  // Get initial gas price estimates from public client
  const feeEstimates = await publicClient.estimateFeesPerGas().catch(() => undefined);
  const gasPrice = await publicClient.getGasPrice();
  let maxPriorityFeePerGas = feeEstimates?.maxPriorityFeePerGas ?? gasPrice;
  let maxFeePerGas = feeEstimates?.maxFeePerGas ?? gasPrice + maxPriorityFeePerGas;

  // Override with Pimlico's recommended gas prices (required for paymaster sponsorship)
  const extendedBundler = bundlerClient as ReturnType<typeof createBundlerClient> & {
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
    // Falls back to public client estimates if Pimlico call fails
  }

  // Build base UserOp
  // Define type explicitly since smartAccount is typed as any
  interface SignableUserOperation {
    sender: Address;
    nonce: bigint;
    factory: Address;
    factoryData: Hex;
    callData: Hex;
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    signature: Hex;
    paymaster?: Address;
    paymasterData?: Hex;
    paymasterPostOpGasLimit?: bigint;
    paymasterVerificationGasLimit?: bigint;
  }

  const baseUserOp: SignableUserOperation = {
    sender: hybridDelegator,
    nonce,
    factory: getAddress(factoryArgs.factory),
    factoryData: factoryArgs.factoryData,
    callData: "0x" as Hex,
    callGasLimit: 0n,
    verificationGasLimit: 0n,
    preVerificationGas: 0n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    signature: "0x" as Hex,
  };

  const buildSponsorRequest = (op: SignableUserOperation) =>
    formatUserOperationRequest({
      ...op,
      paymaster: undefined,
      paymasterData: undefined,
      signature: "0x" as Hex,
    } as any);

  const applySponsorshipToUserOp = (target: SignableUserOperation, update: PimlicoSponsorship) => {
    if (update.callGasLimit && update.callGasLimit > 0n) {
      target.callGasLimit = update.callGasLimit;
    }
    if (update.verificationGasLimit && update.verificationGasLimit > 0n) {
      target.verificationGasLimit = update.verificationGasLimit;
    }
    if (update.preVerificationGas && update.preVerificationGas > 0n) {
      target.preVerificationGas = update.preVerificationGas;
    }
    if (update.paymasterPostOpGasLimit) {
      Object.assign(target, { paymasterPostOpGasLimit: update.paymasterPostOpGasLimit });
    }
    if (update.paymasterVerificationGasLimit) {
      Object.assign(target, {
        paymasterVerificationGasLimit: update.paymasterVerificationGasLimit,
      });
    }

    if (update.paymaster) {
      Object.assign(target, {
        paymaster: update.paymaster,
        paymasterData: update.paymasterData ?? ("0x" as Hex),
      });
    } else {
      Object.assign(target, {
        paymaster: `0x${update.paymasterAndData.slice(2, 42)}` as Hex,
        paymasterData: `0x${update.paymasterAndData.slice(42)}` as Hex,
      });
    }
  };

  const userOp: SignableUserOperation = { ...baseUserOp };

  // Get initial sponsorship
  const sponsorship = await sponsorUserOperation({
    userOperation: buildSponsorRequest(baseUserOp),
    entryPoint: smartAccount.entryPoint.address,
  });
  applySponsorshipToUserOp(userOp, sponsorship);

  // Apply fallback gas limits if needed
  const FALLBACK_VERIFICATION_GAS_LIMIT = 200000n;
  const FALLBACK_PRE_VERIFICATION_GAS = 50000n;

  if (!userOp.verificationGasLimit || userOp.verificationGasLimit === 0n) {
    userOp.verificationGasLimit = FALLBACK_VERIFICATION_GAS_LIMIT;
  }
  if (!userOp.preVerificationGas || userOp.preVerificationGas === 0n) {
    userOp.preVerificationGas = FALLBACK_PRE_VERIFICATION_GAS;
  }

  // Sign UserOp
  const signature = await smartAccount.signUserOperation(userOp);
  const rpcUserOperation = formatUserOperationRequest({
    ...userOp,
    signature,
  } as any);

  // Send UserOp via bundler
  const userOpHash = (await bundlerClient.request(
    {
      method: "eth_sendUserOperation",
      params: [rpcUserOperation, smartAccount.entryPoint.address],
    },
    { retryCount: 0 },
  )) as Hex;

  // Wait for receipt with timeout
  const USER_OPERATION_WAIT_TIMEOUT_MS = 60000; // 60 seconds
  const waitWithTimeout = <T>(promise: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting ${USER_OPERATION_WAIT_TIMEOUT_MS}ms for deployment`));
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
  ) as { receipt?: { transactionHash?: string } } | undefined;

  const txHash = receipt?.receipt?.transactionHash;
  if (!txHash) {
    throw new Error("Deployment UserOp missing transaction hash");
  }

  return txHash as Hex;
};

/**
 * Generate new session key
 */
const generateSessionKey = (): { address: Address; privateKey: Hex } => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    privateKey,
  };
};

// ============================================================================
// Main Onboarding Flow
// ============================================================================

/**
 * Run H2 onboarding flow
 *
 * Steps:
 * 1. Launch Web3Auth/Privy bridge
 * 2. Get authenticated wallet
 * 3. Deploy HybridDelegator via sponsored UserOp (Pimlico pays gas)
 * 4. Generate session key
 * 5. Save session state
 *
 * @returns Onboarding result with all addresses and keys
 */
export const runH2Onboarding = async (): Promise<H2OnboardingResult> => {
  console.log(chalk.bold("\n🤖 Pragma H2 Onboarding\n"));
  console.log(chalk.gray("This will set up your account for H2 transactions.\n"));

  // Use admin test PK if configured
  if (PRAGMA_ADMIN_TEST_PK) {
    console.log(chalk.yellow("⚠️  Using admin test private key from .env\n"));
  }

  // Step 1: Start identity provider bridge
  const identityProvider = PRAGMA_IDENTITY_PROVIDER || "web3auth";
  console.log(chalk.gray(`Identity provider: ${identityProvider}`));

  const bridge =
    identityProvider === "privy"
      ? startPrivyBridge({
          onReady: async (url) => {
            console.log(chalk.cyan(`Opening Privy in browser...`));
            await open(url, { wait: false });
          },
        })
      : startWeb3AuthBridge(async (url) => {
          console.log(chalk.cyan(`Opening Web3Auth in browser...`));
          await open(url, { wait: false });
        });

  const spinner = ora("Waiting for authentication...").start();

  try {
    // Step 2: Wait for wallet authentication
    const { address: registeredAddress } = await bridge.waitForWallet();
    const { walletClient, address: derivedAddress } = await createWalletClientFromBridge(
      bridge,
      registeredAddress,
    );
    const ownerAddress = derivedAddress;

    spinner.succeed(chalk.green(`✓ Connected: ${ownerAddress}`));

    // Step 3: Create HybridDelegator smart account
    spinner.start("Creating smart account...");
    const publicClient = createMonadPublicClient();

    const smartAccount = (await toMetaMaskSmartAccount({
      client: publicClient,
      implementation: Implementation.Hybrid,
      signer: { walletClient: walletClient as any },
      deployParams: [ownerAddress, [], [], []],
      deploySalt: "0x",
    })) as any;

    // Create bundler client for UserOp-based session key funding
    const bundlerClient = createBundlerClient({
      chain: monadChain,
      transport: http(PIMLICO_BUNDLER_URL),
      client: publicClient,
    });

    const hybridDelegatorAddress = await smartAccount.getAddress();
    if (!hybridDelegatorAddress) {
      throw new Error("Failed to derive HybridDelegator address");
    }
    const hybridDelegator = getAddress(hybridDelegatorAddress);

    // Step 4: Check if HybridDelegator is already deployed
    const alreadyDeployed = await isSmartAccountDeployed({
      address: hybridDelegator,
      publicClient,
    });

    if (alreadyDeployed) {
      spinner.succeed(chalk.green(`✓ HybridDelegator already deployed: ${hybridDelegator}`));
    } else {
      spinner.text = "Deploying HybridDelegator (sponsored by Pimlico)...";
      const txHash = await deployHybridDelegator({
        smartAccount,
        bundlerClient,
        publicClient,
        hybridDelegator,
      });
      spinner.succeed(chalk.green(`✓ HybridDelegator deployed: ${hybridDelegator}`));
      console.log(chalk.gray(`   Tx: ${txHash} (gas sponsored by Pimlico)`));
    }

    // Step 5: Get or create persistent session key (H1 pattern)
    spinner.start("Loading session key...");
    const sessionKeyRecord = await getOrCreateH2SessionKey(hybridDelegator);

    if (sessionKeyRecord.isNew) {
      spinner.succeed(chalk.green(`✓ New session key generated: ${sessionKeyRecord.address}`));
      console.log(chalk.gray(`   Fund this address once - it will be reused for future logins`));
    } else {
      spinner.succeed(chalk.green(`✓ Reusing existing session key: ${sessionKeyRecord.address}`));
    }

    // Step 6: Save session state
    spinner.start("Saving session state...");
    const sessionData: H2SessionData = {
      delegator: hybridDelegator,
      sessionKeyAddress: sessionKeyRecord.address,
      sessionKeyPrivateKey: sessionKeyRecord.privateKey,
      ownerAddress,
      chainId: MONAD_CHAIN_ID,
    };
    await saveH2Session(sessionData);
    spinner.succeed(chalk.green(`✓ Session saved`));

    console.log(chalk.bold.green("\n✅ Onboarding complete!\n"));
    console.log(chalk.gray("Your account is now ready for H2 transactions.\n"));
    console.log(chalk.cyan("ℹ️  Session Key Auto-Funding:"));
    console.log(chalk.gray(`   • Your session key (${sessionKeyRecord.address}) handles transaction signing`));
    console.log(chalk.gray(`   • When balance drops below 0.1 MON, we'll auto-transfer 0.5 MON from your smart account`));
    console.log(chalk.gray(`   • You'll be notified each time funding occurs\n`));

    return {
      ownerAddress,
      hybridDelegator,
      sessionKeyAddress: sessionKeyRecord.address,
      sessionKeyPrivateKey: sessionKeyRecord.privateKey,
      walletClient,
      bridge, // Return bridge to keep it alive for signing
      smartAccount, // For UserOp-based session key funding
      bundlerClient, // For UserOp-based session key funding
    };
  } catch (error) {
    spinner.fail(chalk.red("Onboarding failed"));
    // Only shut down bridge if onboarding failed
    await bridge.shutdown();
    throw error;
  }
};
