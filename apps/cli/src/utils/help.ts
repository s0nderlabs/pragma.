import chalk from "chalk";
import type { Command } from "commander";

interface CommandSummaryRow {
  name: string;
  description: string;
}

export const buildCommandSummary = (commands: readonly Command[], prefix: string): CommandSummaryRow[] =>
  commands
    .filter((cmd) => cmd.name() !== "help")
    .map((cmd) => ({
      name: `${prefix}${cmd.name() ? ` ${cmd.name()}` : ""}`,
      description: cmd.description() ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

export const printCommandSummary = (commands: readonly Command[], prefix: string) => {
  const rows = buildCommandSummary(commands, prefix);
  if (rows.length === 0) {
    console.log(chalk.yellow("No commands registered."));
    return;
  }

  const width = rows.reduce((max, row) => Math.max(max, row.name.length), 0);
  for (const row of rows) {
    const padded = row.name.padEnd(width);
    const description = row.description ? `  ${row.description}` : "";
    console.log(`  ${chalk.cyan(padded)}${description}`);
  }
};
