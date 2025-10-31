#!/usr/bin/env node
const originalEmitWarning = process.emitWarning.bind(process) as (
  warning: any,
  ...args: any[]
) => void;

process.emitWarning = ((warning: any, ...args: any[]) => {
  const code: string | undefined =
    typeof warning === "object" && warning && "code" in warning
      ? (warning as { code?: string }).code
      : typeof args[1] === "string"
        ? args[1]
        : typeof args[0] === "string"
          ? args[0]
          : undefined;
  const message = typeof warning === "string" ? warning : warning?.message ?? "";
  if ((code === "DEP0040" || message.includes("DEP0040")) && message.includes("punycode")) {
    return;
  }
  originalEmitWarning(warning, ...args);
}) as typeof process.emitWarning;

process.on("warning", (warning) => {
  const warningWithCode = warning as NodeJS.ErrnoException & { code?: string };
  if (
    warning.name === "ExperimentalWarning" &&
    warning.message.includes("Importing JSON modules")
  ) {
    return;
  }

  if (warningWithCode.code === "DEP0040" && warning.message.includes("punycode")) {
    return;
  }

  console.warn(warning);
});

process.on("unhandledRejection", (reason) => {
  if (reason instanceof Error && reason.name === "APIUserAbortError") {
    return;
  }
  console.error(reason);
});

const { Command } = await import("commander");
const { default: chalk } = await import("chalk");
const { printCommandSummary } = await import("./utils/help.js");

const dotenvModule = await import("dotenv");
dotenvModule.config({ path: new URL("../../../.env", import.meta.url) });

const program = new Command();

program
  .name("pragma")
  .description("Pragma CLI - onboarding, swap, simulate, receipts")
  .version("1.0.0");

const { registerOnboard4337 } = await import("./commands/onboard4337.js");
const { registerSwap } = await import("./commands/swap.js");
const { registerSwapPreview } = await import("./commands/swapPreview.js");
const { registerOnboard7702 } = await import("./commands/onboard7702.js");
const { registerRevoke } = await import("./commands/revoke.js");
const { registerStatus } = await import("./commands/status.js");
const { registerFund } = await import("./commands/fund.js");
const { registerFundFaucet } = await import("./commands/fundFaucet.js");
const { registerDelegationList } = await import("./commands/delegationList.js");
const { registerDelegationIssue } = await import("./commands/delegationIssue.js");
const { registerDelegationRevoke } = await import("./commands/delegationRevoke.js");
const { registerDelegationUpdateTokens } = await import("./commands/delegationUpdateTokens.js");
const { registerDelegationPruneTokens } = await import("./commands/delegationPrune.js");
const { registerSessionReplace } = await import("./commands/replace.js");
const { registerWrap } = await import("./commands/wrap.js");
const { registerUnwrap } = await import("./commands/unwrap.js");
const { registerBalance } = await import("./commands/balance.js");
const { registerTransferMon } = await import("./commands/transferMon.js");
const { registerTransferToken } = await import("./commands/transferToken.js");
const { registerReceipts } = await import("./commands/receipts.js");
const { registerDev } = await import("./commands/dev.js");
const { registerShell } = await import("./commands/shell.js");
const { registerH2 } = await import("./commands/h2.js");

registerOnboard4337(program);
registerSwap(program);
registerSwapPreview(program);
registerOnboard7702(program);
registerRevoke(program);
registerStatus(program);
registerFund(program);
registerFundFaucet(program);
registerDelegationList(program);
registerDelegationIssue(program);
registerDelegationRevoke(program);
registerDelegationUpdateTokens(program);
registerDelegationPruneTokens(program);
registerSessionReplace(program);
registerWrap(program);
registerUnwrap(program);
registerBalance(program);
registerTransferMon(program);
registerTransferToken(program);
registerReceipts(program);
registerDev(program);
registerShell(program);
registerH2(program);

program
  .command("help")
  .description("Show all available Pragma commands")
  .action(() => {
    console.log(chalk.bold("Available commands"));
    printCommandSummary(program.commands, "pragma");
    console.log();
    console.log(chalk.gray("Tip: run 'pragma dev help' for developer playground commands."));
    console.log();
    console.log(program.helpInformation());
  });

const args = process.argv.slice(2);

if (args.length === 0) {
  const { runPragmaAgentRepl } = await import("./services/agentLoop.js");
  try {
    await runPragmaAgentRepl();
  } catch (error) {
    console.error(chalk.red((error as Error).message));
    process.exitCode = 1;
  }
} else {
  program.parseAsync(process.argv);
}
