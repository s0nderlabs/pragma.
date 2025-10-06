import chalk from "chalk";
import { Command } from "commander";

import { registerOnboard4337Test } from "./onboard4337Test.js";
import { registerSwapTest } from "./swapTest.js";
import { registerSwapReuse } from "./swapExisting.js";
import { printCommandSummary } from "../utils/help.js";

export const registerDev = (program: Command) => {
  const dev = program
    .command("dev")
    .description("[dev] Developer playground commands (Sepolia fixtures)");

  registerOnboard4337Test(dev);
  registerSwapTest(dev);
  registerSwapReuse(dev);

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
