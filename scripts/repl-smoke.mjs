#!/usr/bin/env node
import path from "node:path";

import { generateReplFixtures } from "./repl-fixtures.mjs";

const ensureEnv = (name, fallback) => {
  if (!process.env[name] || process.env[name].length === 0) {
    process.env[name] = fallback;
  }
};

const commands = [
  "connect to my delegator",
  "what is pragma?",
  "fetch my balances",
  "swap 0.05 mon to usdc",
  "wrap 0.01 mon",
  "transfer 0.01 mon to 0x3333333333333333333333333333333333333333",
  "exit",
];

const main = async () => {
  const argv = process.argv.slice(2);
  const outFlagIndex = argv.findIndex((arg) => arg === "--out");
  const outDir = outFlagIndex >= 0 && argv[outFlagIndex + 1] ? argv[outFlagIndex + 1] : "fixtures/repl-smoke";
  const resolvedOut = path.resolve(process.cwd(), outDir);

  await generateReplFixtures(resolvedOut);

  process.env.PRAGMA_DELEGATION_DIR = resolvedOut;
  process.env.PRAGMA_FIXTURE_DIR = resolvedOut;
  process.env.PRAGMA_REPL_FIXTURE = "1";
  process.env.PRAGMA_AGENT_SKIP_ONBOARD = "1";

  ensureEnv("PIMLICO_API_KEY", "fixture-api-key");
  ensureEnv("WEB3AUTH_CLIENT_ID", "fixture-client-id");
  ensureEnv("WEB3AUTH_CLIENT_SECRET", "fixture-client-secret");
  ensureEnv("PRAGMA_ADMIN_TEST_PK", "0x" + "11".repeat(32));
  ensureEnv("MONORAIL_APP_ID", "fixture-app");
  ensureEnv("MONORAIL_API_KEY", "fixture-monorail");
  ensureEnv("OPENAI_API_KEY", "fixture-openai");

  const { resetFixtureState, getFixtureState } = await import(
    "../apps/cli/dist/testing/fixtureRuntime.js"
  );
  resetFixtureState();

  const { runPragmaAgentRepl } = await import("../apps/cli/dist/services/agentLoop.js");

  const queue = [...commands];
  const prompt = async () => {
    const next = queue.shift() ?? "exit";
    console.log(`pragma> ${next}`);
    return next;
  };

  await runPragmaAgentRepl({ prompt });

  const state = getFixtureState();
  if ((state.swaps ?? []).length === 0) {
    throw new Error("Fixture swap was not recorded.");
  }
  if ((state.wraps ?? []).length === 0) {
    throw new Error("Fixture wrap was not recorded.");
  }
  if ((state.transfers ?? []).length === 0) {
    throw new Error("Fixture transfer was not recorded.");
  }

  console.log("Fixture smoke test completed.");
  console.log(`Swaps recorded   : ${state.swaps.length}`);
  console.log(`Wraps recorded   : ${state.wraps.length}`);
  console.log(`Transfers recorded: ${state.transfers.length}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
