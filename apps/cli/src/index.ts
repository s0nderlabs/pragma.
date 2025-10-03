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
const { registerOnboard4337Test } = await import("./commands/onboard4337Test.js");
const { registerSwapTest } = await import("./commands/swapTest.js");
const { registerSwapReuse } = await import("./commands/swapExisting.js");
const { registerOnboard7702 } = await import("./commands/onboard7702.js");
const { registerRevoke } = await import("./commands/revoke.js");

registerOnboard4337(program);
registerOnboard4337Test(program);
registerSwapTest(program);
registerSwapReuse(program);
registerOnboard7702(program);
registerRevoke(program);

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
