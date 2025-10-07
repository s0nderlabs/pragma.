import { Command } from "commander";

import { runShell } from "../services/shell.js";

export const registerShell = (program: Command) => {
  program
    .command("shell")
    .description("Launch interactive Pragma shell")
    .action(async () => {
      await runShell();
    });
};
