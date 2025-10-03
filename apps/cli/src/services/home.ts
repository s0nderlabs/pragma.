import chalk from "chalk";
import inquirer from "inquirer";
import { formatEther, formatUnits } from "viem";
import { Address } from "viem";

import { loadDelegationArtifact } from "./delegationArtifacts.js";
import { createSepoliaPublicClient } from "./web3authClients.js";
import { WETH_SEPOLIA, Mode, runOnboard4337 } from "./onboarding4337.js";
import { runSwapTest } from "./swapTest.js";
import { onboardingLogger } from "../utils/logger.js";

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface DelegationSnapshot {
  mode: Mode;
  delegator: Address;
  sessionKey: Address;
  expiresAt: number;
  filePath: string;
  isExpired: boolean;
  ethBalance?: string;
  wethBalance?: string;
}

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return "expired";
  const units: [string, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const parts: string[] = [];
  let remaining = seconds;

  for (const [label, size] of units) {
    if (remaining >= size) {
      const value = Math.floor(remaining / size);
      remaining %= size;
      parts.push(`${value} ${label}${value === 1 ? "" : "s"}`);
    }
  }

  if (parts.length === 0) {
    parts.push(`${remaining} seconds`);
  }

  return parts.slice(0, 2).join(", ");
};

const fetchDelegationSnapshot = async (): Promise<DelegationSnapshot | undefined> => {
  try {
    const { artifact, filePath } = await loadDelegationArtifact();
    const publicClient = createSepoliaPublicClient();

    const delegator = artifact.delegation.delegator as Address;
    const sessionKey = artifact.sessionKeyAddress;
    const expiresAt = artifact.expiresAt;

    let ethBalance: string | undefined;
    let wethBalance: string | undefined;

    try {
      const wei = await publicClient.getBalance({ address: delegator });
      ethBalance = `${formatEther(wei)} ETH`;
    } catch (error) {
      onboardingLogger.debug({ err: error }, "Unable to fetch ETH balance for delegator");
    }

    try {
      const amount = (await publicClient.readContract({
        address: WETH_SEPOLIA,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [delegator],
      })) as bigint;
      if (amount > 0n) {
        wethBalance = `${formatUnits(amount, 18)} WETH`;
      }
    } catch (error) {
      onboardingLogger.debug({ err: error }, "Unable to fetch WETH balance for delegator");
    }

    const isExpired = expiresAt <= Math.floor(Date.now() / 1000);

    return {
      mode: artifact.mode,
      delegator,
      sessionKey,
      expiresAt,
      filePath,
      isExpired,
      ethBalance,
      wethBalance,
    };
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("No delegation artifacts")) return undefined;
    onboardingLogger.debug({ err: error }, "Failed to load delegation artifact");
    return undefined;
  }
};

const printBanner = () => {
  console.log(chalk.bold("Pragma CLI"));
  console.log(chalk.gray("Sepolia · ERC-4337 HybridDelegator"));
  console.log();
};

const printSnapshot = (snapshot?: DelegationSnapshot) => {
  if (!snapshot) {
    console.log(chalk.yellow("No delegation artifacts detected."));
    console.log("Run `pragma onboard:4337` to create your first delegation.\n");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl = snapshot.expiresAt - now;
  const expiryLabel = snapshot.isExpired
    ? chalk.red("expired")
    : chalk.green(`${formatDuration(ttl)} remaining`);

  console.log(chalk.bold("Latest Delegation"));
  console.log(`  Mode        : ${snapshot.mode}`);
  console.log(`  Delegator   : ${snapshot.delegator}`);
  console.log(`  Session key : ${snapshot.sessionKey}`);
  console.log(
    `  Expires at  : ${new Date(snapshot.expiresAt * 1000).toISOString()} (${expiryLabel})`,
  );
  console.log(`  Artifact    : ${snapshot.filePath}`);
  if (snapshot.ethBalance) console.log(`  ETH balance : ${snapshot.ethBalance}`);
  if (snapshot.wethBalance) console.log(`  WETH balance: ${snapshot.wethBalance}`);
  console.log();
};

const PROMPT_CANCELLED = "PROMPT_CANCELLED";

const promptMode = async (defaultMode: Mode = "safe"): Promise<Mode> => {
  try {
    const { mode } = await inquirer.prompt<{ mode: Mode }>([
      {
        type: "list",
        name: "mode",
        message: "Select mode",
        default: defaultMode,
        choices: [
          { name: "Safe (pair scoped, tighter limits)", value: "safe" },
          { name: "Normal (curated set, broader limits)", value: "normal" },
        ],
      },
    ]);
    return mode;
  } catch (error) {
    const message = (error as Error).message ?? "";
    if (message.includes("force closed")) {
      throw new Error(PROMPT_CANCELLED);
    }
    throw error;
  }
};

export const launchHome = async () => {
  printBanner();
  const snapshot = await fetchDelegationSnapshot();
  printSnapshot(snapshot);

  let action: string;
  try {
    ({ action } = await inquirer.prompt<{ action: string }>([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          { name: "Onboard 4337 user", value: "onboard" },
          { name: "Run WETH→UNI swap test", value: "swapTest" },
          { name: "Show help & exit", value: "help" },
          { name: "Exit", value: "exit" },
        ],
      },
    ]));
  } catch (error) {
    const message = (error as Error).message ?? "";
    if (message.includes("force closed")) {
      console.log();
      console.log(chalk.gray("No action selected."));
      return;
    }
    throw error;
  }

  switch (action) {
    case "onboard": {
      try {
        const mode = await promptMode();
        onboardingLogger.info({ mode }, "Starting 4337 onboarding (interactive home)");
        await runOnboard4337(mode);
      } catch (error) {
        if ((error as Error).message === PROMPT_CANCELLED) {
          console.log(chalk.gray("Action cancelled."));
          return;
        }
        throw error;
      }
      break;
    }
    case "swapTest": {
      try {
        const mode = await promptMode();
        onboardingLogger.info({ mode }, "Starting swap test (interactive home)");
        await runSwapTest(mode);
      } catch (error) {
        if ((error as Error).message === PROMPT_CANCELLED) {
          console.log(chalk.gray("Action cancelled."));
          return;
        }
        throw error;
      }
      break;
    }
    case "help": {
      console.log();
      console.log(chalk.bold("Quick Commands"));
      console.log("  pragma onboard:4337         – full onboarding with Web3Auth");
      console.log("  pragma swap --from …       – (planned) production swap flow");
      console.log("  pragma revoke               – bump nonce and invalidate sessions");
      console.log("  pragma swap:test            – dev playground (deploy + swap)");
      console.log();
      break;
    }
    default:
      break;
  }
};
