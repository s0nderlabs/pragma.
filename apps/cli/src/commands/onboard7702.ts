import { Command } from "commander";
import chalk from "chalk";

export const registerOnboard7702 = (program: Command) => {
  program
    .command("onboard:7702")
    .description("(Postponed) Onboard an EOA via 7702 StatelessDelegator")
    .action(() => {
      console.log(
        chalk.yellow(
          "EIP-7702 onboarding is postponed for H1 (MVP). Please use 4337 onboarding instead."
        ),
      );
    });
};
