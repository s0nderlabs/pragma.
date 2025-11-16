/**
 * Pimlico Paymaster Integration
 *
 * Provides UserOperation sponsorship via Pimlico's paymaster service.
 * Used for:
 * - Smart account deployment (ERC-4337 UserOps)
 * - Initial session key funding (bypass 10 MON reserve requirement)
 *
 * Why paymaster for session key funding?
 * Pimlico bundler requires 10 MON minimum balance for self-paid UserOps.
 * Paymaster bypasses this check by paying gas from Pimlico's deposit.
 */

import type { Hex } from "viem";
import type { RpcUserOperation } from "viem/account-abstraction";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Pimlico API Key
 * Supports both server-side and client-side environments
 */
const PIMLICO_API_KEY =
  process.env.PIMLICO_API_KEY || process.env.NEXT_PUBLIC_PIMLICO_API_KEY;

/**
 * Pimlico Chain Identifier
 * @default monad-testnet
 */
const PIMLICO_CHAIN =
  process.env.PIMLICO_CHAIN || process.env.NEXT_PUBLIC_PIMLICO_CHAIN || "monad-testnet";

/**
 * Build Pimlico URL helper
 * Supports both custom URL override and API key-based URL construction
 */
const buildPimlicoUrl = (override?: string) => {
  if (override) return override;
  if (!PIMLICO_API_KEY) return "";
  return `https://api.pimlico.io/v2/${PIMLICO_CHAIN}/rpc?apikey=${PIMLICO_API_KEY}`;
};

/**
 * Pimlico Paymaster URL
 * Endpoint for pm_sponsorUserOperation RPC calls
 */
const PIMLICO_PAYMASTER_URL = buildPimlicoUrl(
  process.env.PIMLICO_PAYMASTER_URL || process.env.NEXT_PUBLIC_PIMLICO_PAYMASTER_URL
);

/**
 * Pimlico Sponsorship Policy ID (optional)
 * Used to apply specific sponsorship policies (e.g., gas limits, spending caps)
 */
const PIMLICO_SPONSORSHIP_POLICY_ID =
  process.env.PIMLICO_SPONSORSHIP_POLICY_ID || process.env.NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID;

// ============================================================================
// Types
// ============================================================================

type PimlicoSponsorParams = {
  userOperation: RpcUserOperation;
  entryPoint: Hex;
};

export type PimlicoSponsorship = {
  paymasterAndData: Hex;
  paymaster?: Hex;
  paymasterData?: Hex;
  preVerificationGas?: bigint;
  verificationGasLimit?: bigint;
  callGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  paymasterVerificationGasLimit?: bigint;
};

// ============================================================================
// Utilities
// ============================================================================

/**
 * Serialize UserOperation for Pimlico API
 * Removes paymasterAndData and normalizes optional fields to null
 */
const serializeForPimlico = (userOperation: RpcUserOperation) => {
  const payload: Record<string, unknown> = { ...userOperation };
  delete payload.paymasterAndData;

  if (!payload.paymaster) payload.paymaster = null;
  if (!payload.paymasterData) payload.paymasterData = null;
  if (!payload.paymasterPostOpGasLimit) payload.paymasterPostOpGasLimit = null;
  if (!payload.paymasterVerificationGasLimit) payload.paymasterVerificationGasLimit = null;

  return payload;
};

/**
 * Parse optional gas values from Pimlico response
 * Handles both hex strings and undefined/null values
 */
const parseOptionalGas = (value?: string | null) =>
  value && value !== "0x" ? BigInt(value) : undefined;

// ============================================================================
// Main Export
// ============================================================================

/**
 * Sponsor UserOperation via Pimlico Paymaster
 *
 * Calls Pimlico's pm_sponsorUserOperation endpoint to get paymaster sponsorship.
 * Returns paymaster address, data, and updated gas limits.
 *
 * @param params.userOperation - UserOp to sponsor (should have paymaster fields cleared)
 * @param params.entryPoint - EntryPoint contract address
 * @returns Sponsorship data including paymaster address and gas limits
 * @throws Error if Pimlico API fails or returns invalid response
 *
 * @example
 * ```typescript
 * const sponsorship = await sponsorUserOperation({
 *   userOperation: buildSponsorRequest(userOp),
 *   entryPoint: "0x...",
 * });
 * applySponsorshipToUserOp(userOp, sponsorship);
 * ```
 */
export const sponsorUserOperation = async (
  params: PimlicoSponsorParams
): Promise<PimlicoSponsorship> => {
  if (!PIMLICO_PAYMASTER_URL) {
    throw new Error(
      "Pimlico paymaster URL not configured. " +
        "Set PIMLICO_PAYMASTER_URL or NEXT_PUBLIC_PIMLICO_PAYMASTER_URL environment variable."
    );
  }

  const serialized = serializeForPimlico(params.userOperation);
  const requestParams: unknown[] = [serialized, params.entryPoint];

  const options: Record<string, string> = {};
  if (PIMLICO_SPONSORSHIP_POLICY_ID) {
    options.sponsorshipPolicyId = PIMLICO_SPONSORSHIP_POLICY_ID;
  }
  if (Object.keys(options).length > 0) {
    requestParams.push(options);
  }

  const response = await fetch(PIMLICO_PAYMASTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "pm_sponsorUserOperation",
      params: requestParams,
    }),
  });

  const payload = (await response.json().catch(() => undefined)) as
    | { result?: Record<string, string | null | undefined>; error?: { message?: string } }
    | undefined;

  if (!response.ok || payload?.error) {
    const message = payload?.error?.message ?? `Pimlico paymaster error (${response.status})`;
    throw new Error(message);
  }

  const result = payload?.result;
  if (!result) {
    throw new Error("Pimlico paymaster did not return a result");
  }

  let paymasterAndData = result.paymasterAndData as string | undefined;
  if ((!paymasterAndData || paymasterAndData === "0x") && result.paymaster && result.paymasterData) {
    paymasterAndData = `${result.paymaster}${(result.paymasterData as string).slice(2)}`;
  }

  if (!paymasterAndData || paymasterAndData === "0x") {
    throw new Error(
      `Pimlico paymaster response missing paymasterAndData (response: ${JSON.stringify(result)})`
    );
  }

  return {
    paymasterAndData: paymasterAndData as Hex,
    paymaster: result.paymaster as Hex | undefined,
    paymasterData: result.paymasterData as Hex | undefined,
    preVerificationGas: parseOptionalGas(result.preVerificationGas ?? undefined),
    verificationGasLimit: parseOptionalGas(result.verificationGasLimit ?? undefined),
    callGasLimit: parseOptionalGas(result.callGasLimit ?? undefined),
    paymasterPostOpGasLimit: parseOptionalGas(result.paymasterPostOpGasLimit ?? undefined),
    paymasterVerificationGasLimit: parseOptionalGas(
      result.paymasterVerificationGasLimit ?? undefined
    ),
  };
};
