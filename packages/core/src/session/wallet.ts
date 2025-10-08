import type { Chain, Transport } from "viem";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { SessionDelegationInfo } from "../delegations/types.js";

export interface SessionWalletConfig {
  chain: Chain;
  rpcUrl?: string;
  transport?: Transport;
}

export const createSessionWallet = (
  session: SessionDelegationInfo,
  { chain, rpcUrl, transport }: SessionWalletConfig,
): ReturnType<typeof createWalletClient> => {
  const account = privateKeyToAccount(session.sessionKeyPrivateKey);
  const resolvedTransport = transport ?? http(rpcUrl ?? chain.rpcUrls.default.http[0]);
  return createWalletClient({
    chain,
    transport: resolvedTransport,
    account,
  }) as ReturnType<typeof createWalletClient>;
};
