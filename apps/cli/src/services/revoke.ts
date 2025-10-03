import chalk from "chalk";
import ora from "ora";

import { onboardingLogger } from "../utils/logger.js";

type Mode = "safe" | "normal";

export const runRevoke = async (mode: Mode) => {
  onboardingLogger.info({ mode }, "Revoking delegations via nonce bump (mock)");
  const spinner = ora("Bumping nonce/epoch").start();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  spinner.succeed("Nonce bumped (mock)");
  console.log(chalk.green("All delegations revoked (placeholder)"));
};
