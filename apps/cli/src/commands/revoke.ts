import { Command } from "commander";
import chalk from "chalk";

import { onboardingLogger } from "../utils/logger.js";
import { runRevoke } from "../services/revoke.js";

type Mode = "safe" | "normal";

export const registerRevoke = (program: Command) => {
  program
    .command("revoke")
    .description("Revoke delegations by bumping NonceEnforcer and optionally disabling")
    .option("--mode <mode>", "safe | normal", "safe")
    .option("--delegator <address>", "Specify HybridDelegator address")
    .option("--artifact <path>", "Path to delegation artifact")
    .option("--disable-only", "Disable the target delegation without bumping nonce")
    .option("--also-disable", "Disable the delegation after bumping nonce")
    .option("--privy", "Force Privy identity provider for login/signing")
    .option("--web3auth", "Force Web3Auth identity provider for login/signing")
    .action(
      async ({
        mode,
        delegator,
        artifact,
        disableOnly,
        alsoDisable,
        privy,
        web3auth,
      }: {
        mode: string;
        delegator?: string;
        artifact?: string;
        disableOnly?: boolean;
        alsoDisable?: boolean;
        privy?: boolean;
        web3auth?: boolean;
      }) => {
        const normalizedMode = mode.toLowerCase();
        if (!["safe", "normal"].includes(normalizedMode)) {
          console.error(chalk.red("Invalid mode. Use 'safe' or 'normal'."));
          process.exit(1);
        }

        if (privy && web3auth) {
          console.error(chalk.red("Choose either --privy or --web3auth (not both)."));
          process.exit(1);
        }

        if (disableOnly && alsoDisable) {
          console.error(chalk.red("Cannot combine --disable-only with --also-disable."));
          process.exit(1);
        }

        onboardingLogger.info({ mode: normalizedMode, disableOnly, alsoDisable }, "Revoking delegations");

        try {
          await runRevoke({
            mode: normalizedMode as Mode,
            delegator,
            artifactPath: artifact,
            disableOnly: Boolean(disableOnly),
            alsoDisable: Boolean(alsoDisable),
            identityHint: privy ? "privy" : web3auth ? "web3auth" : undefined,
          });
          onboardingLogger.info({ mode: normalizedMode }, "Delegations revoked");
        } catch (error) {
          onboardingLogger.error({ err: error }, "Revoke flow failed");
          console.error(chalk.red((error as Error).message));
          process.exit(1);
        }
      },
    );
};
