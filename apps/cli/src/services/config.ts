export const getEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

const getEnvOptional = (name: string): string | undefined => process.env[name];

export const PIMLICO_API_KEY = getEnv("PIMLICO_API_KEY");
export const PIMLICO_CHAIN = getEnvOptional("PIMLICO_CHAIN") ?? "sepolia";
const buildPimlicoUrl = (overrideVar: string | undefined) => {
  if (overrideVar) return overrideVar;
  const url = `https://api.pimlico.io/v2/${PIMLICO_CHAIN}/rpc?apikey=${PIMLICO_API_KEY}`;
  return url;
};

export const PIMLICO_BUNDLER_URL = buildPimlicoUrl(getEnvOptional("PIMLICO_BUNDLER_URL"));
export const PIMLICO_PAYMASTER_URL = buildPimlicoUrl(getEnvOptional("PIMLICO_PAYMASTER_URL"));
export const PIMLICO_SPONSORSHIP_POLICY_ID = getEnvOptional("PIMLICO_SPONSORSHIP_POLICY_ID");
export const SEPOLIA_RPC_URL = getEnv("SEPOLIA_RPC_URL");
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
export const SEPOLIA_WETH_ADDRESS = getEnv("SEPOLIA_WETH");
export const SEPOLIA_UNI_ADDRESS = getEnv("SEPOLIA_UNI");
export const SEPOLIA_USDC_ADDRESS = getEnvOptional("SEPOLIA_USDC");
export const SEPOLIA_QUOTER_V2_ADDRESS =
  process.env.SEPOLIA_QUOTER_V2 ?? "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3";
export const SEPOLIA_WETH_UNI_POOL_ADDRESS =
  process.env.SEPOLIA_WETH_UNI_POOL ?? "0x287B0e934ed0439E2a7b1d5F0FC25eA2c24b64f7";
export const SEPOLIA_SWAP_ROUTER_ADDRESS =
  process.env.SEPOLIA_SWAP_ROUTER ?? "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
export const SEPOLIA_WETH_USDC_POOL_ADDRESS = process.env.SEPOLIA_WETH_USDC_POOL;
export const SEPOLIA_UNI_USDC_POOL_ADDRESS = process.env.SEPOLIA_UNI_USDC_POOL;

export const PRIVY_APP_ID = getEnvOptional("PRIVY_ID");
export const PRIVY_APP_SECRET = getEnvOptional("PRIVY_SECRET");
export const PRAGMA_IDENTITY_PROVIDER = getEnvOptional("PRAGMA_IDENTITY_PROVIDER");

const parsePort = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port value: ${value}`);
  }
  return parsed;
};

export const WEB3AUTH_BRIDGE_PORT = parsePort(process.env.WEB3AUTH_BRIDGE_PORT);
