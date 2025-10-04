import { Command } from "commander";

import { getStatusSnapshot, renderStatusSnapshot } from "../services/status.js";

export const registerStatus = (program: Command) => {
  program
    .command("status")
    .description("Show current HybridDelegator + delegation snapshot")
    .action(async () => {
      const snapshot = await getStatusSnapshot();
      renderStatusSnapshot(snapshot);
    });
};
