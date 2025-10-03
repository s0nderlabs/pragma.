import type { RpcUserOperation } from "viem/account-abstraction";
import type { Hex } from "viem";

import {
  PIMLICO_PAYMASTER_URL,
  PIMLICO_SPONSORSHIP_POLICY_ID,
} from "./config.js";

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

const serializeForPimlico = (userOperation: RpcUserOperation) => {
  const payload: Record<string, unknown> = { ...userOperation };

  delete payload.paymasterAndData;

  if (!payload.paymaster) payload.paymaster = null;
  if (!payload.paymasterData) payload.paymasterData = null;
  if (!payload.paymasterPostOpGasLimit) payload.paymasterPostOpGasLimit = null;
  if (!payload.paymasterVerificationGasLimit) payload.paymasterVerificationGasLimit = null;

  return payload;
};

const parseOptionalGas = (value?: string | null) =>
  value && value !== "0x" ? BigInt(value) : undefined;

export const sponsorUserOperation = async (
  params: PimlicoSponsorParams,
): Promise<PimlicoSponsorship> => {
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
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "pm_sponsorUserOperation",
      params: requestParams,
    }),
  });

  const payload = await response.json().catch(() => undefined);
  if (!response.ok || payload?.error) {
    const message = payload?.error?.message ?? `Pimlico paymaster error (${response.status})`;
    throw new Error(message);
  }

  const result = payload?.result as Record<string, string | null | undefined> | undefined;
  if (!result) {
    throw new Error("Pimlico paymaster did not return a result");
  }

  let paymasterAndData = result.paymasterAndData as string | undefined;
  if ((!paymasterAndData || paymasterAndData === "0x") && result.paymaster && result.paymasterData) {
    paymasterAndData = `${result.paymaster}${(result.paymasterData as string).slice(2)}`;
  }

  if (!paymasterAndData || paymasterAndData === "0x") {
    throw new Error(
      `Pimlico paymaster response missing paymasterAndData (response: ${JSON.stringify(result)})`,
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
      result.paymasterVerificationGasLimit ?? undefined,
    ),
  };
};
