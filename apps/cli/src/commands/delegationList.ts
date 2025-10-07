import { Command } from "commander";
import chalk from "chalk";

import { listDelegationArtifacts, isDelegationExpired } from "../services/delegationArtifacts.js";
import { formatEther, getAddress, Hex, Address } from "viem";
import { getDeleGatorEnvironment } from "@metamask/delegation-toolkit";
import { createMonadPublicClient } from "../services/web3authClients.js";
import { DEFAULT_CALL_LIMITS } from "../services/onboarding4337.js";
import type { AllowedToken } from "../services/monorailTokens.js";
import { MONAD_CHAIN_ID } from "../services/config.js";

const formatTokenInfo = (token: AllowedToken): string => {
  const tags: string[] = [];
  if (token.kind === "native") tags.push("native");
  if (token.kind === "wrappedNative") tags.push("wrapped");
  if (token.categories && token.categories.length > 0) {
    tags.push(...token.categories.slice(0, 3));
  } else {
    tags.push("legacy");
  }
  const tagSuffix = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
  return `${token.symbol ?? token.address} (${token.address})${tagSuffix}`;
};
const LIMITED_CALLS_ABI = [
  {
    type: "function",
    name: "callCounts",
    stateMutability: "view",
    inputs: [
      { name: "delegationManager", type: "address" },
      { name: "delegationHash", type: "bytes32" },
    ],
    outputs: [{ name: "count", type: "uint256" }],
  },
] as const;

const DELEGATION_MANAGER_ABI = [
  {
    type: "function",
    name: "getDelegationHash",
    stateMutability: "view",
    inputs: [
      {
        name: "delegation",
        type: "tuple",
        components: [
          { name: "delegate", type: "address" },
          { name: "delegator", type: "address" },
          { name: "authority", type: "bytes32" },
          {
            name: "caveats",
            type: "tuple[]",
            components: [
              { name: "enforcer", type: "address" },
              { name: "terms", type: "bytes" },
              { name: "args", type: "bytes" },
            ],
          },
          { name: "salt", type: "uint256" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "delegationHash", type: "bytes32" }],
  },
] as const;

export const registerDelegationList = (program: Command) => {
  program
    .command("delegation:list")
    .description("List stored delegation artifacts under ~/.pragma/test-delegations")
    .option("--delegator <address>", "Filter by HybridDelegator address")
    .action(async ({ delegator }: { delegator?: string }) => {
      const normalizedDelegator = delegator ? getAddress(delegator) : undefined;
      const items = await listDelegationArtifacts(normalizedDelegator);
      if (items.length === 0) {
        console.log(chalk.yellow("No delegation artifacts found."));
        console.log("Run `pragma onboard:4337` to issue the first delegation.");
        return;
      }

      const publicClient = createMonadPublicClient();
      const environment = getDeleGatorEnvironment(MONAD_CHAIN_ID);
      const limitedCallsAddress = environment.caveatEnforcers?.LimitedCallsEnforcer;

      for (const { artifact, filePath } of items) {
        const expiryNumber = Number(artifact.expiresAt);
        const hasExpiry = Number.isFinite(expiryNumber) && expiryNumber > 0;
        const ttl = hasExpiry ? expiryNumber - Math.floor(Date.now() / 1000) : undefined;
        const expired = hasExpiry ? isDelegationExpired(artifact) : false;

        let ethBalance: string | undefined;
        try {
          const balance = await publicClient.getBalance({ address: artifact.delegation.delegator });
          ethBalance = `${formatEther(balance)} MON`;
        } catch {}

        const delegatorAddress = (() => {
          try {
            return getAddress(artifact.delegation.delegator);
          } catch {
            return artifact.delegation.delegator;
          }
        })();

        if (normalizedDelegator && delegatorAddress.toLowerCase() !== normalizedDelegator.toLowerCase()) {
          continue;
        }

        console.log(chalk.bold(filePath));
        console.log(`  Mode        : ${artifact.mode}`);
        console.log(`  Kind        : ${artifact.kind ?? "swap"}`);
        console.log(`  Delegator   : ${delegatorAddress}`);
        console.log(`  Session key : ${artifact.sessionKeyAddress}`);
        console.log(`  Session secret: ${artifact.sessionKeyPrivateKey}`);
        const callsUnlimited = artifact.callsUnlimited ?? false;
        const fallbackLimit = DEFAULT_CALL_LIMITS[artifact.mode];
        const callLimitValue = callsUnlimited ? null : artifact.callLimit ?? fallbackLimit;
        console.log(
          `  Call limit  : ${
            callsUnlimited ? "Unlimited (LimitedCalls disabled)" : `${callLimitValue} call${callLimitValue === 1 ? "" : "s"}`
          }`,
        );
        let callsRemainingDisplay = callsUnlimited ? "∞" : callLimitValue !== null ? `${callLimitValue}` : "n/a";
        if (!callsUnlimited && callLimitValue !== null && limitedCallsAddress) {
          try {
            const normalizedDelegation = {
              delegate: getAddress(artifact.delegation.delegate),
              delegator: getAddress(artifact.delegation.delegator),
              authority: artifact.delegation.authority as Hex,
              caveats: (artifact.delegation.caveats ?? []).map((caveat) => ({
                enforcer: getAddress(caveat.enforcer),
                terms: (caveat.terms ?? "0x") as Hex,
                args: (caveat.args ?? "0x") as Hex,
              })),
              salt: BigInt(artifact.delegation.salt ?? "0x0"),
              signature: artifact.delegation.signature as Hex,
            };
            const delegationHash = (await publicClient.readContract({
              address: environment.DelegationManager as Address,
              abi: DELEGATION_MANAGER_ABI,
              functionName: "getDelegationHash",
              args: [normalizedDelegation],
            })) as Hex;
            const usedCalls = (await publicClient.readContract({
              address: limitedCallsAddress as Address,
              abi: LIMITED_CALLS_ABI,
              functionName: "callCounts",
              args: [environment.DelegationManager as Address, delegationHash],
            })) as bigint;
            const limitBigInt = BigInt(callLimitValue);
            const remainingBigInt = limitBigInt > usedCalls ? limitBigInt - usedCalls : 0n;
            callsRemainingDisplay = `${remainingBigInt.toString()} of ${limitBigInt.toString()}`;
          } catch {
            callsRemainingDisplay = `${callLimitValue} (usage unavailable)`;
          }
        }
        if (!callsUnlimited && callLimitValue !== null) {
          console.log(`  Calls left  : ${callsRemainingDisplay}`);
        }
        console.log(`  Nonce       : ${(artifact.sessionNonce ?? "0x0").toLowerCase()}`);
        if (hasExpiry && ttl !== undefined) {
          try {
            const iso = new Date(expiryNumber * 1000).toISOString();
            console.log(
              `  Expires at  : ${iso} (${expired ? chalk.red("expired") : chalk.green(`${Math.max(ttl, 0)}s remaining`)})`,
            );
          } catch {
            console.log("  Expires at  : invalid timestamp (unable to format)");
          }
        } else {
          console.log("  Expires at  : unknown (no timestamp caveat detected)");
        }
        if (ethBalance) console.log(`  MON balance : ${ethBalance}`);
        if (artifact.kind === "transfer") {
          if (artifact.transferMaxAmount) {
            try {
              const formatted = formatEther(BigInt(artifact.transferMaxAmount));
              console.log(`  Native cap  : ${formatted} MON`);
            } catch {
              console.log(`  Native cap  : ${artifact.transferMaxAmount} wei`);
            }
          } else {
            console.log("  Native cap  : unlimited (no cap recorded)");
          }
        } else if ((artifact.allowedTokens ?? []).length > 0) {
          console.log("  Allowed tokens:");
          for (const token of artifact.allowedTokens ?? []) {
            console.log(`    - ${formatTokenInfo(token)}`);
          }
        }
        console.log();
      }
    });
};
