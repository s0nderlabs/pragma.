import chalk from "chalk";
import { Command } from "commander";

import { registerOnboard4337Test } from "./onboard4337Test.js";
import { registerSwapTest } from "./swapTest.js";
import { registerSwapApprovalBenchmark } from "./swapApprovalBenchmark.js";
import { registerSwapReuse } from "./swapExisting.js";
import { registerTransferReuse } from "./transferReuse.js";
import { registerTransferTest } from "./transferTest.js";
import { registerTransferDualTest } from "./transferDualTest.js";
import { printCommandSummary } from "../utils/help.js";

export const registerDev = (program: Command) => {
  const dev = program
    .command("dev")
    .description("[dev] Developer playground commands for Monad testnet experimentation");

  registerOnboard4337Test(dev);
  registerSwapTest(dev);
  registerSwapApprovalBenchmark(dev);
  registerSwapReuse(dev);
  registerTransferReuse(dev);
  registerTransferTest(dev);
  registerTransferDualTest(dev);

  dev
    .command("help")
    .description("Show developer playground commands")
    .action(() => {
      console.log(chalk.bold("[dev] Playground commands"));
      printCommandSummary(dev.commands, "pragma dev");
      console.log();
      console.log(dev.helpInformation());
    });
};
