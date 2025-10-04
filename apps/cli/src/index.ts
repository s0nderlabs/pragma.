#!/usr/bin/env node
process.on("warning", (warning) => {
  if (
    warning.name === "ExperimentalWarning" &&
    warning.message.includes("Importing JSON modules")
  ) {
    return;
  }

  console.warn(warning);
});

const { Command } = await import("commander");
const { default: chalk } = await import("chalk");

const dotenvModule = await import("dotenv");
dotenvModule.config({ path: new URL("../../../.env", import.meta.url) });

const program = new Command();

program
  .name("pragma")
  .description("Pragma CLI — onboarding, swap, simulate, receipts")
  .version("1.0.0");

const { registerOnboard4337 } = await import("./commands/onboard4337.js");
const { registerSwap } = await import("./commands/swap.js");
const { registerOnboard7702 } = await import("./commands/onboard7702.js");
const { registerRevoke } = await import("./commands/revoke.js");
const { registerStatus } = await import("./commands/status.js");
const { registerFund } = await import("./commands/fund.js");
const { registerFundFaucet } = await import("./commands/fundFaucet.js");
const { registerDelegationList } = await import("./commands/delegationList.js");
const { registerDelegationIssue } = await import("./commands/delegationIssue.js");
const { registerDelegationRevoke } = await import("./commands/delegationRevoke.js");
const { registerSessionReplace } = await import("./commands/replace.js");
const { registerReceipts } = await import("./commands/receipts.js");
const { registerDev } = await import("./commands/dev.js");

registerOnboard4337(program);
registerSwap(program);
registerOnboard7702(program);
registerRevoke(program);
registerStatus(program);
registerFund(program);
registerFundFaucet(program);
registerDelegationList(program);
registerDelegationIssue(program);
registerDelegationRevoke(program);
registerSessionReplace(program);
registerReceipts(program);
registerDev(program);

program
  .command("help")
  .description("Show all available Pragma commands")
  .action(() => {
    program.outputHelp();
  });

const args = process.argv.slice(2);

if (args.length === 0) {
  const { launchHome } = await import("./services/home.js");
  try {
    await launchHome();
  } catch (error) {
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
  process.exit(0);
}

program.parseAsync(process.argv);
