import chalk from "chalk";
import inquirer from "inquirer";

import { Mode, runOnboard4337 } from "./onboarding4337.js";
import { runSwapTest } from "./swapTest.js";
import { onboardingLogger } from "../utils/logger.js";
import { getStatusSnapshot, renderStatusSnapshot } from "./status.js";

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
  console.log();
  const snapshot = await getStatusSnapshot();
  renderStatusSnapshot(snapshot);
  console.log();

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
      console.log("  pragma status                – show latest delegation snapshot");
      console.log("  pragma fund --watch          – monitor gas funding for delegator");
      console.log("  pragma swap --help           – execute swaps (coming soon)");
      console.log("  pragma revoke                – bump nonce and invalidate sessions");
      console.log("  pragma dev --help            – developer playground (Sepolia)");
      console.log();
      break;
    }
    default:
      break;
  }
};
