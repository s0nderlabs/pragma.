/**
 * Get Session Key Balance Tool
 *
 * Fetches the MON balance of the ephemeral session key used for gas.
 * The session key is different from the smart account - it's a separate address
 * that holds MON specifically for paying gas fees during transaction execution.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { formatUnits, parseUnits } from "viem";
import type { Address, PublicClient } from "viem";
import { emitProgress } from "../progress/emitter.js";

const getSessionKeyBalanceSchema = z.object({
  // No parameters needed - uses sessionData from config
});

export const getSessionKeyBalanceTool = tool(
  async (_input, config) => {
    const sessionData = config?.configurable?.sessionData;
    const publicClient = config?.configurable?.publicClient as PublicClient;

    if (!sessionData?.sessionKeyAddress) {
      return "No session key found. Session key is created during onboarding.";
    }

    const sessionKeyAddress = sessionData.sessionKeyAddress as Address;

    try {
      emitProgress("Checking session key balance...");

      const balance = await publicClient.getBalance({ address: sessionKeyAddress });
      const balanceFormatted = formatUnits(balance, 18);

      // Warn if balance is low
      const minBalance = parseUnits("0.1", 18);
      const isLow = balance < minBalance;

      if (isLow) {
        return `⚠️  Your session key has ${balanceFormatted} MON (LOW)\n\n` +
          `Address: ${sessionKeyAddress}\n` +
          `Threshold: 0.1 MON\n\n` +
          `The session key will be automatically funded (0.5 MON) when you execute the next transaction.`;
      }

      return `Your session key has ${balanceFormatted} MON\n\n` +
        `Address: ${sessionKeyAddress}\n\n` +
        `This balance is used to pay for gas when executing transactions. ` +
        `It's automatically funded from your smart account when it falls below 0.1 MON.`;
    } catch (error) {
      return `Unable to fetch session key balance. Error: ${(error as Error).message}`;
    }
  },
  {
    name: "getSessionKeyBalance",
    description: "Get session key MON balance (gas funds). Use for 'session key balance' questions. Call search_tool_docs('getSessionKeyBalance') for detailed usage.",
    schema: getSessionKeyBalanceSchema,
  }
);
