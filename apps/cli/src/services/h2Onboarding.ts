/**
 * H2 Onboarding Service
 *
 * Simplified onboarding for H2 - no persistent delegation creation.
 * Just deploy HybridDelegator and generate session key.
 *
 * Key Differences from H1:
 * - NO delegation creation during onboarding
 * - Simpler flow (auth → deploy → session key → save)
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
  toMetaMaskSmartAccount,
  Implementation,
} from "@metamask/delegation-toolkit";

import { startWeb3AuthBridge } from "./web3authServer.js";
import { startPrivyBridge } from "./privyBridgeServer.js";
import { createMonadPublicClient, createWalletClientFromBridge, monadChain } from "./web3authClients.js";
import { saveH2Session, getOrCreateH2SessionKey, type H2SessionData } from "./sessionStore.js";
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
 * Deploy HybridDelegator via direct transaction
 */
const deployHybridDelegator = async ({
  smartAccount,
  walletClient,
  publicClient,
}: {
  smartAccount: any;
  walletClient: any;
  publicClient: ReturnType<typeof createMonadPublicClient>;
}): Promise<Hex> => {
  if (!walletClient?.sendTransaction) {
    throw new Error("Wallet client required for HybridDelegator deployment");
  }

  const factoryArgs = await smartAccount.getFactoryArgs?.();
  if (!factoryArgs) {
    throw new Error("Unable to fetch factory args for HybridDelegator");
  }

  const txParams = {
    to: getAddress(factoryArgs.factory),
    data: factoryArgs.factoryData,
    value: 0n,
  };

  const txHash = await walletClient.sendTransaction(txParams);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
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
 * 3. Deploy HybridDelegator (or check if exists)
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
      spinner.text = "Deploying HybridDelegator...";
      const txHash = await deployHybridDelegator({
        smartAccount,
        walletClient,
        publicClient,
      });
      spinner.succeed(chalk.green(`✓ HybridDelegator deployed: ${hybridDelegator}`));
      console.log(chalk.gray(`   Tx: ${txHash}`));
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
    console.log(chalk.gray("Your account is now ready for H2 transactions."));
    console.log(chalk.gray("Session key will be funded automatically when needed.\n"));

    return {
      ownerAddress,
      hybridDelegator,
      sessionKeyAddress: sessionKeyRecord.address,
      sessionKeyPrivateKey: sessionKeyRecord.privateKey,
      walletClient,
      bridge, // Return bridge to keep it alive for signing
    };
  } catch (error) {
    spinner.fail(chalk.red("Onboarding failed"));
    // Only shut down bridge if onboarding failed
    await bridge.shutdown();
    throw error;
  }
};
