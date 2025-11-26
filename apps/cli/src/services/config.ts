export const getEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

const getEnvOptional = (name: string): string | undefined => process.env[name];

export const PIMLICO_API_KEY = getEnv("PIMLICO_API_KEY");
export const PIMLICO_CHAIN = getEnvOptional("PIMLICO_CHAIN") ?? "monad-testnet";
const buildPimlicoUrl = (overrideVar: string | undefined) => {
  if (overrideVar) return overrideVar;
  const url = `https://api.pimlico.io/v2/${PIMLICO_CHAIN}/rpc?apikey=${PIMLICO_API_KEY}`;
  return url;
};

export const PIMLICO_BUNDLER_URL = buildPimlicoUrl(getEnvOptional("PIMLICO_BUNDLER_URL"));
export const PIMLICO_PAYMASTER_URL = buildPimlicoUrl(getEnvOptional("PIMLICO_PAYMASTER_URL"));
export const PIMLICO_SPONSORSHIP_POLICY_ID = getEnvOptional("PIMLICO_SPONSORSHIP_POLICY_ID");

const DEFAULT_MONAD_EXECUTION_RPC_URL = "https://testnet-rpc.monad.xyz";
const DEFAULT_MONAD_READ_RPC_URL = "https://monad-testnet.rpc.hypersync.xyz";
const DEFAULT_HYPERSYNC_URL = "https://monad-testnet.hypersync.xyz";
export const MONAD_CHAIN_ID = 10_143;
export const MONAD_EXECUTION_RPC_URL =
  getEnvOptional("MONAD_EXECUTION_RPC_URL") ??
  getEnvOptional("MONAD_RPC_URL") ??
  DEFAULT_MONAD_EXECUTION_RPC_URL;
/** @deprecated Use MONAD_EXECUTION_RPC_URL instead. */
export const MONAD_RPC_URL = MONAD_EXECUTION_RPC_URL;
export const MONAD_READ_RPC_URL =
  getEnvOptional("MONAD_ENVIO_READ_RPC_URL") ?? DEFAULT_MONAD_READ_RPC_URL;
export const MONAD_HYPERSYNC_URL = getEnvOptional("MONAD_HYPERSYNC_URL") ?? DEFAULT_HYPERSYNC_URL;
export const ENVIO_TOKEN_API = getEnvOptional("ENVIO_TOKEN_API");
const getEnvFallback = (primary: string, alternative: string) => {
  const primaryValue = process.env[primary];
  if (primaryValue) {
    return primaryValue;
  }

  const altValue = process.env[alternative];
  if (altValue) {
    return altValue;
  }

  throw new Error(`Missing environment variable: ${primary} (or fallback ${alternative})`);
};

export const WEB3AUTH_CLIENT_ID = getEnvFallback("WEB3AUTH_CLIENT_ID", "WEB3_AUTH_ID");
export const WEB3AUTH_CLIENT_SECRET = getEnvFallback(
  "WEB3AUTH_CLIENT_SECRET",
  "WEB3_AUTH_SECRET",
);
export const WEB3AUTH_NETWORK = process.env.WEB3AUTH_NETWORK ?? "sapphire_devnet";
export const PRAGMA_ADMIN_TEST_PK = getEnv("PRAGMA_ADMIN_TEST_PK");

export const PRIVY_APP_ID = getEnvOptional("PRIVY_ID");
export const PRIVY_APP_SECRET = getEnvOptional("PRIVY_SECRET");
export const PRAGMA_IDENTITY_PROVIDER = getEnvOptional("PRAGMA_IDENTITY_PROVIDER");

export const MONORAIL_PATHFINDER_URL =
  process.env.MONORAIL_PATHFINDER_URL ?? "https://testnet-pathfinder.monorail.xyz/v4";
export const MONORAIL_DATA_API_URL =
  process.env.MONORAIL_DATA_API_URL ?? "https://testnet-api.monorail.xyz/v1";
export const MONORAIL_APP_ID = getEnvOptional("MONORAIL_APP_ID");
export const MONORAIL_AGGREGATOR_ADDRESS =
  getEnvOptional("MONORAIL_AGGREGATOR_ADDRESS") ?? "0x525B929fCd6a64AfF834f4eeCc6E860486cED700";

export const MONAD_NATIVE_TOKEN_SYMBOL = "MON";
export const MONAD_NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";
export const MONAD_WRAPPED_TOKEN_SYMBOL = "WMON";
export const MONAD_WMON_ADDRESS =
  getEnvOptional("MONAD_WMON_ADDRESS") ?? "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701";

export const APRIORI_TOKEN_SYMBOL = "aprMON";
export const APRIORI_ADDRESS =
  getEnvOptional("APRIORI_ADDRESS") ?? "0xb2f82D0f38dc453D596Ad40A37799446Cc89274A";

const parsePort = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port value: ${value}`);
  }
  return parsed;
};

export const WEB3AUTH_BRIDGE_PORT = parsePort(process.env.WEB3AUTH_BRIDGE_PORT);
