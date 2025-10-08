#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const randomHex = (bytes) => `0x${randomBytes(bytes).toString("hex")}`;

const parseBalance = (value) => value.toString();

export const generateReplFixtures = async (outDir) => {
  const resolveOutDir = path.resolve(process.cwd(), outDir);
  const delegator = "0x339A1063e84C6Ef785D7bA73a786b87AC8Fb61Aa";
  const sessionKey = randomHex(20);
  const sessionKeySecret = randomHex(32);
  const now = Math.floor(Date.now() / 1000);

  const MON = "0x0000000000000000000000000000000000000000";
  const WMON = "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701";
  const USDC = "0x1111111111111111111111111111111111111111";
  const BUN = "0x2222222222222222222222222222222222222222";

  const swapArtifact = {
    mode: "normal",
    sessionKeyPrivateKey: sessionKeySecret,
    sessionKeyAddress: sessionKey,
    delegation: {
      delegate: sessionKey,
      delegator,
      authority: "0x",
      caveats: [],
      salt: "0x1",
      signature: `0x${"aa".repeat(65)}`,
    },
    expiresAt: now + 24 * 60 * 60,
    callLimit: 12,
    callsUnlimited: false,
    sessionNonce: "0x01",
    allowedTokens: [
      { address: MON, symbol: "MON", decimals: 18, kind: "native" },
      { address: WMON, symbol: "WMON", decimals: 18, kind: "wrappedNative" },
      { address: USDC, symbol: "USDC", decimals: 6, kind: "erc20" },
      { address: BUN, symbol: "BUN", decimals: 18, kind: "erc20", categories: ["trending"] },
    ],
    kind: "swap",
  };

  const transferArtifact = {
    mode: "normal",
    sessionKeyPrivateKey: sessionKeySecret,
    sessionKeyAddress: sessionKey,
    delegation: {
      delegate: sessionKey,
      delegator,
      authority: "0x",
      caveats: [],
      salt: "0x2",
      signature: `0x${"bb".repeat(65)}`,
    },
    expiresAt: now + 24 * 60 * 60,
    callLimit: null,
    callsUnlimited: true,
    sessionNonce: "0x02",
    allowedTokens: [],
    kind: "transfer",
    transferMaxAmount: parseBalance(1n * 10n ** 18n),
  };

  const delegatorDir = path.join(resolveOutDir, delegator.toLowerCase());
  await ensureDir(delegatorDir);
  const timestamp = Date.now();
  await fs.writeFile(
    path.join(delegatorDir, `session-${timestamp}.json`),
    JSON.stringify(swapArtifact, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(delegatorDir, `session-${timestamp + 1}.json`),
    JSON.stringify(transferArtifact, null, 2),
    "utf8",
  );

  const sessionState = {
    delegator,
    requireOnboard: false,
  };

  await fs.writeFile(path.join(resolveOutDir, "agent-session.json"), JSON.stringify(sessionState, null, 2), "utf8");

  const walletBalances = {
    [delegator.toLowerCase()]: [
      {
        address: MON,
        symbol: "MON",
        name: "Monad",
        decimals: 18,
        balance: "500000000000000000",
        mon_value: "0.5",
        usd_value: "9.6",
        categories: ["native"],
      },
      {
        address: USDC,
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        balance: "1500000",
        mon_value: "0.2",
        usd_value: "3.2",
        categories: ["stable"],
      },
      {
        address: BUN,
        symbol: "BUN",
        name: "Bun",
        decimals: 18,
        balance: "1200000000000000000",
        mon_value: "0.1",
        usd_value: "1.5",
        categories: ["trending"],
      },
    ],
    [sessionKey.toLowerCase()]: [
      {
        address: MON,
        symbol: "MON",
        name: "Monad",
        decimals: 18,
        balance: "200000000000000000",
        mon_value: "0.2",
        usd_value: "3.8",
        categories: ["native"],
      },
    ],
  };

  const portfolioValues = {
    [delegator.toLowerCase()]: { value: "0.8" },
  };

  const tokens = [
    { address: MON, symbol: "MON", name: "Monad", decimals: 18, categories: ["native", "verified"] },
    { address: WMON, symbol: "WMON", name: "Wrapped Monad", decimals: 18, categories: ["wrapped", "verified"] },
    { address: USDC, symbol: "USDC", name: "USD Coin", decimals: 6, categories: ["stable", "trending"] },
    { address: BUN, symbol: "BUN", name: "Bun", decimals: 18, categories: ["trending"] },
  ];

  const insightsFixture = {
    walletBalances,
    portfolioValues,
    tokens,
    trendingTokens: tokens.filter((token) =>
      Array.isArray(token.categories) && token.categories.some((cat) => cat.toLowerCase().includes("trending")),
    ),
  };

  await fs.writeFile(
    path.join(resolveOutDir, "insights.json"),
    JSON.stringify(insightsFixture, null, 2),
    "utf8",
  );

  console.log(`Fixture artifacts written to ${resolveOutDir}`);
  console.log(`Delegator: ${delegator}`);
  console.log(`Session key: ${sessionKey}`);
};

const isDirect = () => {
  try {
    const currentUrl = pathToFileURL(process.argv[1] ?? "").href;
    return import.meta.url === currentUrl;
  } catch {
    return false;
  }
};

if (isDirect()) {
  const argv = process.argv.slice(2);
  const outFlagIndex = argv.findIndex((arg) => arg === "--out");
  const outDir = outFlagIndex >= 0 && argv[outFlagIndex + 1] ? argv[outFlagIndex + 1] : "fixtures/repl";

  generateReplFixtures(outDir).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
