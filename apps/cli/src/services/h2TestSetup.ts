/**
 * H2 Test Setup - Direct PK Testing Infrastructure
 *
 * This module provides test environment setup for H2 without Web3Auth.
 * It handles HybridDelegator deployment, session key generation, and
 * automatic session key funding.
 *
 * Pattern mirrors H1's `setupHybridDelegatorTest()` but for H2's architecture.
 */

import { type Hex, type Address, createWalletClient, http, parseEther, formatEther, getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toMetaMaskSmartAccount, Implementation } from "@metamask/delegation-toolkit";
import chalk from "chalk";
import ora from "ora";
import os from "os";
import fs from "fs";

import { createMonadPublicClient, monadChain } from "./web3authClients.js";
import { PRAGMA_ADMIN_TEST_PK } from "./config.js";
import { saveH2Session, getOrCreateH2SessionKey, type H2SessionData } from "./sessionStore.js";
import { createDirectPKBridge, type H2Bridge } from "./h2Bridge.js";

// ============================================================================
// Constants
// ============================================================================

const MONAD_EXECUTION_RPC_URL =
  process.env.MONAD_EXECUTION_RPC_URL || "https://rpc.ankr.com/monad_testnet";
const MONAD_CHAIN_ID = 10143;
const SESSION_KEY_FUNDING_AMOUNT = parseEther("0.5"); // 0.5 MON

// ============================================================================
// Types
// ============================================================================

export interface H2TestContext {
  /** Root private key used for signing */
  rootPrivateKey: Hex;
  /** Root account (from PK) */
  rootAccount: ReturnType<typeof privateKeyToAccount>;
  /** HybridDelegator address (smart account) */
  hybridDelegator: Address;
  /** Session key (ephemeral) */
  sessionKey: {
    address: Address;
    privateKey: Hex;
  };
  /** Direct PK bridge (mock Web3Auth) */
  bridge: H2Bridge;
  /** Wallet client */
  walletClient: any;
  /** Public client */
  publicClient: any;
  /** Session state (saved to file) */
  sessionState: H2SessionData;
}

export interface H2TestSetupOptions {
  /** Private key to use (defaults to PRAGMA_ADMIN_TEST_PK or generates new) */
  privateKey?: Hex;
  /** Skip HybridDelegator deployment (reuse existing) */
  skipDeploy?: boolean;
  /** Skip session key funding */
  skipFunding?: boolean;
  /** Force new session key generation (don't reuse existing) */
  newSession?: boolean;
}

// ============================================================================
// Test Environment Setup
// ============================================================================

/**
 * Setup H2 test environment with direct PK signing
 *
 * This function:
 * 1. Creates a root account from private key
 * 2. Deploys HybridDelegator (or reuses existing)
 * 3. Generates session key
 * 4. **Automatically funds session key** from HybridDelegator
 * 5. Saves session to ~/.pragma/agent-session.json
 * 6. Returns test context for H2 REPL
 *
 * @param options - Setup options
 * @returns Test context with all necessary components
 *
 * @example
 * ```typescript
 * const context = await setupH2TestEnvironment({
 *   privateKey: PRAGMA_ADMIN_TEST_PK,
 *   skipDeploy: false,
 * });
 *
 * // Context ready for H2 REPL
 * await runPragmaH2Repl({ ...context });
 * ```
 */
export async function setupH2TestEnvironment(
  options: H2TestSetupOptions = {}
): Promise<H2TestContext> {
  const spinner = ora();

  try {
    // Step 1: Get or generate private key
    spinner.start("Initializing test environment...");
    const rootPrivateKey =
      options.privateKey ||
      (PRAGMA_ADMIN_TEST_PK as Hex | undefined) ||
      generatePrivateKey();

    const rootAccount = privateKeyToAccount(rootPrivateKey);
    const publicClient = createMonadPublicClient();

    spinner.succeed(`Root account: ${chalk.cyan(rootAccount.address)}`);

    // Step 2: Create wallet client with direct account
    spinner.start("Creating wallet client...");
    const walletClient = createWalletClient({
      chain: monadChain,
      transport: http(MONAD_EXECUTION_RPC_URL),
      account: rootAccount,
    });
    spinner.succeed("Wallet client created");

    // Step 3: Check root account balance
    spinner.start("Checking account balance...");
    const rootBalance = await publicClient.getBalance({
      address: rootAccount.address,
    });
    const rootBalanceFormatted = formatEther(rootBalance);

    if (rootBalance === 0n) {
      spinner.fail(chalk.red("Root account has no balance!"));
      console.log(chalk.yellow(`\n⚠️  Please fund ${rootAccount.address} with MON first`));
      throw new Error("Insufficient root account balance");
    }

    spinner.succeed(`Balance: ${chalk.green(rootBalanceFormatted)} MON`);

    // Step 4: Create smart account
    spinner.start("Creating HybridDelegator smart account...");
    const smartAccount = await toMetaMaskSmartAccount({
      client: publicClient as any,
      implementation: Implementation.Hybrid,
      signer: { account: rootAccount }, // Direct account, not bridge
      deployParams: [rootAccount.address, [], [], []],
      deploySalt: "0x",
    });

    const hybridDelegator = getAddress(await smartAccount.getAddress());
    spinner.succeed(`HybridDelegator: ${chalk.cyan(hybridDelegator)}`);

    // Step 5: Deploy if needed
    if (!options.skipDeploy) {
      spinner.start("Checking deployment status...");
      const code = await publicClient.getCode({ address: hybridDelegator });
      const isDeployed = code && code !== "0x";

      if (!isDeployed) {
        spinner.text = "Deploying HybridDelegator...";

        // Send deployment transaction using factory args
        const factoryArgs = await smartAccount.getFactoryArgs?.();
        if (!factoryArgs) {
          throw new Error("Unable to fetch factory args for HybridDelegator deployment");
        }

        const hash = await walletClient.sendTransaction({
          to: getAddress(factoryArgs.factory),
          data: factoryArgs.factoryData,
          value: 0n,
          chain: null,
        });

        spinner.text = `Waiting for deployment confirmation...`;
        await publicClient.waitForTransactionReceipt({ hash });
        spinner.succeed(chalk.green(`✓ HybridDelegator deployed: ${hash}`));
      } else {
        spinner.succeed("HybridDelegator already deployed");
      }
    } else {
      spinner.info("Skipping deployment (--skip-deploy)");
    }

    // Step 6: Fund HybridDelegator (for testing)
    if (!options.skipFunding) {
      spinner.start("Checking HybridDelegator balance...");
      const hybridBalance = await publicClient.getBalance({
        address: hybridDelegator,
      });

      const needsInitialFunding = hybridBalance < parseEther("3"); // Want 3 MON in HybridDelegator

      if (needsInitialFunding) {
        spinner.text = `Funding HybridDelegator with 3 MON from root account...`;

        // Check root account has enough
        if (rootBalance < parseEther("3")) {
          spinner.fail(chalk.red(`Insufficient root account balance`));
          console.log(chalk.yellow(`\n⚠️  Root account has ${formatEther(rootBalance)} MON`));
          console.log(chalk.yellow(`   Need at least 3 MON to fund HybridDelegator\n`));
          throw new Error("Insufficient root account balance");
        }

        // Send 3 MON from root account to HybridDelegator
        const hybridFundingHash = await walletClient.sendTransaction({
          to: hybridDelegator,
          value: parseEther("3"),
          chain: null,
        });

        spinner.text = "Waiting for HybridDelegator funding confirmation...";
        await publicClient.waitForTransactionReceipt({ hash: hybridFundingHash });

        const newHybridBalance = await publicClient.getBalance({
          address: hybridDelegator,
        });

        spinner.succeed(
          chalk.green(
            `✓ HybridDelegator funded: ${formatEther(newHybridBalance)} MON (tx: ${hybridFundingHash})`
          )
        );
      } else {
        spinner.succeed(
          `HybridDelegator already funded: ${formatEther(hybridBalance)} MON`
        );
      }
    }

    // Step 7: Get or create persistent session key (H1 pattern)
    spinner.start("Loading session key...");
    const sessionKeyRecord = await getOrCreateH2SessionKey(hybridDelegator);
    const sessionKeyAddress = sessionKeyRecord.address;
    const sessionKeyPrivateKey = sessionKeyRecord.privateKey;

    if (sessionKeyRecord.isNew) {
      spinner.succeed(`New session key generated: ${chalk.cyan(sessionKeyAddress)}`);
      console.log(chalk.gray(`   This key will be reused for this smart account on future runs`));
    } else {
      spinner.succeed(`Reusing existing session key: ${chalk.cyan(sessionKeyAddress)}`);
    }

    // Step 8: Fund session key from HybridDelegator balance (unless skipFunding)
    if (!options.skipFunding) {
      spinner.start(`Checking session key balance...`);
      const sessionBalance = await publicClient.getBalance({
        address: sessionKeyAddress,
      });

      const needsFunding = sessionBalance < parseEther("0.1"); // Min threshold

      if (needsFunding) {
        spinner.text = `Funding session key with ${formatEther(SESSION_KEY_FUNDING_AMOUNT)} MON...`;

        // Check HybridDelegator balance
        const hybridBalance = await publicClient.getBalance({
          address: hybridDelegator,
        });

        if (hybridBalance < SESSION_KEY_FUNDING_AMOUNT) {
          spinner.fail(chalk.red(`Insufficient HybridDelegator balance for session key funding`));
          console.log(chalk.yellow(`\n⚠️  HybridDelegator has ${formatEther(hybridBalance)} MON`));
          console.log(chalk.yellow(`   Need at least ${formatEther(SESSION_KEY_FUNDING_AMOUNT)} MON to fund session key\n`));
          throw new Error("Insufficient HybridDelegator balance");
        }

        // Send funding transaction from root account to session key
        // (In test mode, root account manages HybridDelegator's funds)
        const fundingHash = await walletClient.sendTransaction({
          to: sessionKeyAddress,
          value: SESSION_KEY_FUNDING_AMOUNT,
          chain: null,
        });

        spinner.text = "Waiting for session key funding confirmation...";
        await publicClient.waitForTransactionReceipt({ hash: fundingHash });

        const newBalance = await publicClient.getBalance({
          address: sessionKeyAddress,
        });

        spinner.succeed(
          chalk.green(
            `✓ Session key funded: ${formatEther(newBalance)} MON (tx: ${fundingHash})`
          )
        );
      } else {
        spinner.succeed(
          `Session key already funded: ${formatEther(sessionBalance)} MON`
        );
      }
    } else {
      spinner.info("Skipping session key funding (--skip-funding)");
    }

    // Step 8: Create direct PK bridge
    const bridge = createDirectPKBridge(rootPrivateKey);

    // Step 9: Save session state
    spinner.start("Saving session state...");
    const sessionState: H2SessionData = {
      delegator: hybridDelegator,
      sessionKeyAddress,
      sessionKeyPrivateKey,
      ownerAddress: rootAccount.address,
      chainId: MONAD_CHAIN_ID,
    };

    await saveH2Session(sessionState);
    spinner.succeed("Session saved to ~/.pragma/agent-session.json");

    // Step 10: Return test context
    return {
      rootPrivateKey,
      rootAccount,
      hybridDelegator,
      sessionKey: {
        address: sessionKeyAddress,
        privateKey: sessionKeyPrivateKey,
      },
      bridge,
      walletClient,
      publicClient,
      sessionState,
    };
  } catch (error) {
    spinner.fail(chalk.red("Failed to setup test environment"));
    throw error;
  }
}
