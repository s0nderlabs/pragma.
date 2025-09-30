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

const program = new Command();

program
  .name("pragma")
  .description("Pragma CLI — onboarding, swap, simulate, receipts")
  .version("1.0.0");

program
  .command("hello")
  .description("Test command to verify CLI is working")
  .action(async () => {
    process.stdout.write("Running test...\n");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log(chalk.green("Hello from Pragma CLI 🎉"));
  });

const args = process.argv.slice(2);

if (args.length === 0) {
  program.outputHelp();
  process.exit(0);
}

program.parseAsync(process.argv);
