import type { Address, Hex } from "viem";

export type PragmaErrorClass =
  | "Intent"
  | "Policy"
  | "Simulation"
  | "Drift"
  | "Execution"
  | "Infra"
  | "Onboarding"
  | "IO";

export type PragmaErrorModule =
  | "Intent"
  | "Routing"
  | "Simulation"
  | "Execution"
  | "Receipts"
  | "Onboarding"
  | "Observability"
  | "Common";

export type PragmaErrorSeverity = "warn" | "error" | "fatal";

export interface PragmaErrorContext {
  chain_id?: number;
  tx_hash?: Hex;
  plan_hash?: Hex;
  session_key_id?: Address;
  [key: string]: unknown;
}

export interface PragmaError extends Error {
  code: string;
  class: PragmaErrorClass;
  module: PragmaErrorModule;
  retriable: boolean;
  severity: PragmaErrorSeverity;
  context?: PragmaErrorContext;
  cause?: unknown;
}

export interface CreateErrorParams {
  code: string;
  message: string;
  class: PragmaErrorClass;
  module: PragmaErrorModule;
  retriable: boolean;
  severity: PragmaErrorSeverity;
  context?: PragmaErrorContext;
  cause?: unknown;
}

export interface PragmaErrorDefinition {
  code: string;
  class: PragmaErrorClass;
  module: PragmaErrorModule;
  severity: PragmaErrorSeverity;
  retriable: boolean;
  defaultMessage: string;
}

type DefinitionRecord = Readonly<Record<string, PragmaErrorDefinition>>;

export const ERROR_DEFINITIONS: DefinitionRecord = {
  ACTION_MALFORMED: {
    code: "ACTION_MALFORMED",
    class: "Intent",
    module: "Intent",
    severity: "error",
    retriable: false,
    defaultMessage: "Unable to parse requested action.",
  },
  ACTION_UNSUPPORTED: {
    code: "ACTION_UNSUPPORTED",
    class: "Intent",
    module: "Intent",
    severity: "error",
    retriable: false,
    defaultMessage: "Requested action is not supported.",
  },
  AMOUNT_EXCEEDS_CAP: {
    code: "AMOUNT_EXCEEDS_CAP",
    class: "Policy",
    module: "Simulation",
    severity: "error",
    retriable: false,
    defaultMessage: "Requested amount exceeds policy cap.",
  },
  AMOUNT_MALFORMED: {
    code: "AMOUNT_MALFORMED",
    class: "Intent",
    module: "Intent",
    severity: "error",
    retriable: false,
    defaultMessage: "Amount is malformed or out of range.",
  },
  AMOUNT_MISSING: {
    code: "AMOUNT_MISSING",
    class: "Intent",
    module: "Intent",
    severity: "error",
    retriable: false,
    defaultMessage: "Amount is required for this action.",
  },
  CONFIG_MISSING: {
    code: "CONFIG_MISSING",
    class: "Infra",
    module: "Common",
    severity: "fatal",
    retriable: false,
    defaultMessage: "Required configuration is missing.",
  },
  DUPLICATE_REQUEST: {
    code: "DUPLICATE_REQUEST",
    class: "Policy",
    module: "Common",
    severity: "warn",
    retriable: false,
    defaultMessage: "Duplicate request detected.",
  },
  DRIFT_PREVIEW_EXPIRED: {
    code: "DRIFT_PREVIEW_EXPIRED",
    class: "Drift",
    module: "Simulation",
    severity: "error",
    retriable: true,
    defaultMessage: "Plan preview expired before execution.",
  },
  DRIFT_QUOTE_STALE: {
    code: "DRIFT_QUOTE_STALE",
    class: "Drift",
    module: "Routing",
    severity: "error",
    retriable: true,
    defaultMessage: "Quote is stale and must be refreshed.",
  },
  EXEC_BUNDLER_SUBMIT_FAILED: {
    code: "EXEC_BUNDLER_SUBMIT_FAILED",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: true,
    defaultMessage: "Bundler rejected transaction submission.",
  },
  EXEC_CAVEAT_NONCE_REJECT: {
    code: "EXEC_CAVEAT_NONCE_REJECT",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: false,
    defaultMessage: "Nonce caveat rejected the execution.",
  },
  EXEC_CAVEAT_RATE_LIMIT: {
    code: "EXEC_CAVEAT_RATE_LIMIT",
    class: "Execution",
    module: "Execution",
    severity: "warn",
    retriable: true,
    defaultMessage: "Delegation rate limit exceeded.",
  },
  EXEC_CAVEAT_SCOPE_REJECT: {
    code: "EXEC_CAVEAT_SCOPE_REJECT",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: false,
    defaultMessage: "Delegation scope rejected this call.",
  },
  EXEC_CAVEAT_TTL_EXPIRED: {
    code: "EXEC_CAVEAT_TTL_EXPIRED",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: false,
    defaultMessage: "Delegation TTL expired before execution.",
  },
  EXEC_DELEGATION_REDEEM_REVERT: {
    code: "EXEC_DELEGATION_REDEEM_REVERT",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: true,
    defaultMessage: "Delegation redemption reverted on-chain.",
  },
  EXEC_DUPLICATE_NONCE: {
    code: "EXEC_DUPLICATE_NONCE",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: true,
    defaultMessage: "Nonce already used for execution.",
  },
  EXEC_ENTRYPOINT_REVERT: {
    code: "EXEC_ENTRYPOINT_REVERT",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: true,
    defaultMessage: "EntryPoint reverted the execution.",
  },
  EXEC_PAYMASTER_REJECT: {
    code: "EXEC_PAYMASTER_REJECT",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: true,
    defaultMessage: "Paymaster rejected sponsorship request.",
  },
  EXEC_ROUTER_REVERT: {
    code: "EXEC_ROUTER_REVERT",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: true,
    defaultMessage: "Swap router reverted.",
  },
  EXEC_TX_DROPPED_OR_STALE: {
    code: "EXEC_TX_DROPPED_OR_STALE",
    class: "Execution",
    module: "Execution",
    severity: "warn",
    retriable: true,
    defaultMessage: "Transaction dropped or became stale.",
  },
  EXEC_UNDERPRICED: {
    code: "EXEC_UNDERPRICED",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: true,
    defaultMessage: "Transaction underpriced for inclusion.",
  },
  EXEC_USEROP_BUILD_FAILED: {
    code: "EXEC_USEROP_BUILD_FAILED",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: true,
    defaultMessage: "Failed to build user operation.",
  },
  EXECUTION_ERROR: {
    code: "EXECUTION_ERROR",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: true,
    defaultMessage: "Execution encountered an error.",
  },
  EXECUTION_FAILED: {
    code: "EXECUTION_FAILED",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: false,
    defaultMessage: "Execution failed.",
  },
  TRANSACTION_EXECUTION_FAILED: {
    code: "TRANSACTION_EXECUTION_FAILED",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: true,
    defaultMessage: "Transaction execution failed on-chain.",
  },
  INTERNAL_ASSERTION_FAILED: {
    code: "INTERNAL_ASSERTION_FAILED",
    class: "Infra",
    module: "Common",
    severity: "fatal",
    retriable: false,
    defaultMessage: "Internal invariant violated.",
  },
  LOG_WRITE_FAILED: {
    code: "LOG_WRITE_FAILED",
    class: "IO",
    module: "Observability",
    severity: "warn",
    retriable: true,
    defaultMessage: "Failed to persist log entry.",
  },
  METRICS_FLUSH_FAILED: {
    code: "METRICS_FLUSH_FAILED",
    class: "IO",
    module: "Observability",
    severity: "warn",
    retriable: true,
    defaultMessage: "Metrics flush failed.",
  },
  ONBOARD_7702_CONFLICT: {
    code: "ONBOARD_7702_CONFLICT",
    class: "Onboarding",
    module: "Onboarding",
    severity: "error",
    retriable: false,
    defaultMessage: "7702 delegation already exists for this account.",
  },
  ONBOARD_7702_EXPIRED: {
    code: "ONBOARD_7702_EXPIRED",
    class: "Onboarding",
    module: "Onboarding",
    severity: "error",
    retriable: true,
    defaultMessage: "7702 delegation payload expired.",
  },
  ONBOARD_7702_NOT_SUPPORTED: {
    code: "ONBOARD_7702_NOT_SUPPORTED",
    class: "Onboarding",
    module: "Onboarding",
    severity: "fatal",
    retriable: false,
    defaultMessage: "7702 onboarding not supported.",
  },
  ONBOARD_AUTH_FAILED: {
    code: "ONBOARD_AUTH_FAILED",
    class: "Onboarding",
    module: "Onboarding",
    severity: "error",
    retriable: false,
    defaultMessage: "Authentication provider error.",
  },
  ONBOARD_DELEGATION_MALFORMED: {
    code: "ONBOARD_DELEGATION_MALFORMED",
    class: "Onboarding",
    module: "Onboarding",
    severity: "error",
    retriable: false,
    defaultMessage: "Delegation payload is malformed.",
  },
  ONBOARD_DELEGATION_SIGN_REJECTED: {
    code: "ONBOARD_DELEGATION_SIGN_REJECTED",
    class: "Onboarding",
    module: "Onboarding",
    severity: "warn",
    retriable: false,
    defaultMessage: "User rejected delegation signature.",
  },
  ONBOARD_DEPLOY_FAILED: {
    code: "ONBOARD_DEPLOY_FAILED",
    class: "Execution",
    module: "Onboarding",
    severity: "error",
    retriable: true,
    defaultMessage: "HybridDelegator deployment reverted.",
  },
  ONBOARD_ENTRYPOINT_NOT_SUPPORTED: {
    code: "ONBOARD_ENTRYPOINT_NOT_SUPPORTED",
    class: "Infra",
    module: "Onboarding",
    severity: "fatal",
    retriable: false,
    defaultMessage: "Unsupported EntryPoint for this chain.",
  },
  ONBOARD_FUNDING_REQUIRED: {
    code: "ONBOARD_FUNDING_REQUIRED",
    class: "Onboarding",
    module: "Onboarding",
    severity: "error",
    retriable: false,
    defaultMessage: "Account requires funding before continuing.",
  },
  ONBOARD_NONCE_BUMP_FAILED: {
    code: "ONBOARD_NONCE_BUMP_FAILED",
    class: "Onboarding",
    module: "Onboarding",
    severity: "error",
    retriable: true,
    defaultMessage: "Failed to bump delegation nonce.",
  },
  PAIR_REQUIRED_SAFE_MODE: {
    code: "PAIR_REQUIRED_SAFE_MODE",
    class: "Policy",
    module: "Intent",
    severity: "error",
    retriable: false,
    defaultMessage: "Safe mode requires selecting a token pair.",
  },
  POLICY_CONFLICT: {
    code: "POLICY_CONFLICT",
    class: "Policy",
    module: "Simulation",
    severity: "error",
    retriable: false,
    defaultMessage: "Policy conflict detected.",
  },
  QUOTE_DEX_REVERT: {
    code: "QUOTE_DEX_REVERT",
    class: "Simulation",
    module: "Routing",
    severity: "error",
    retriable: true,
    defaultMessage: "Underlying DEX call reverted during quoting.",
  },
  QUOTE_NO_ROUTE: {
    code: "QUOTE_NO_ROUTE",
    class: "Simulation",
    module: "Routing",
    severity: "warn",
    retriable: true,
    defaultMessage: "Pathfinder could not find a route.",
  },
  QUOTE_PREPARATION_ERROR: {
    code: "QUOTE_PREPARATION_ERROR",
    class: "Simulation",
    module: "Routing",
    severity: "error",
    retriable: true,
    defaultMessage: "Failed to prepare quote data.",
  },
  QUOTE_RPC_ERROR: {
    code: "QUOTE_RPC_ERROR",
    class: "Infra",
    module: "Routing",
    severity: "error",
    retriable: true,
    defaultMessage: "Failed to query Pathfinder API.",
  },
  QUOTE_STALE: {
    code: "QUOTE_STALE",
    class: "Drift",
    module: "Routing",
    severity: "warn",
    retriable: true,
    defaultMessage: "Quote is stale.",
  },
  RPC_RATE_LIMITED: {
    code: "RPC_RATE_LIMITED",
    class: "Infra",
    module: "Common",
    severity: "warn",
    retriable: true,
    defaultMessage: "RPC provider rate limited the request.",
  },
  RPC_UNAVAILABLE: {
    code: "RPC_UNAVAILABLE",
    class: "Infra",
    module: "Common",
    severity: "error",
    retriable: true,
    defaultMessage: "RPC provider unavailable.",
  },
  RECEIPT_BUILD_FAILED: {
    code: "RECEIPT_BUILD_FAILED",
    class: "IO",
    module: "Receipts",
    severity: "error",
    retriable: true,
    defaultMessage: "Failed to build receipt payload.",
  },
  RECEIPT_DECODE_FAILED: {
    code: "RECEIPT_DECODE_FAILED",
    class: "IO",
    module: "Receipts",
    severity: "error",
    retriable: true,
    defaultMessage: "Failed to decode receipt log.",
  },
  RECEIPT_LOGS_MISSING: {
    code: "RECEIPT_LOGS_MISSING",
    class: "IO",
    module: "Receipts",
    severity: "error",
    retriable: true,
    defaultMessage: "Expected logs missing from transaction.",
  },
  RECEIPT_PLAN_HASH_MISMATCH: {
    code: "RECEIPT_PLAN_HASH_MISMATCH",
    class: "Drift",
    module: "Receipts",
    severity: "error",
    retriable: false,
    defaultMessage: "Plan hash mismatch between preview and execution.",
  },
  SESSION_KEY_INVALID: {
    code: "SESSION_KEY_INVALID",
    class: "Policy",
    module: "Execution",
    severity: "error",
    retriable: false,
    defaultMessage: "Session key information is invalid or missing.",
  },
  SESSION_INCOMPLETE: {
    code: "SESSION_INCOMPLETE",
    class: "Infra",
    module: "Common",
    severity: "fatal",
    retriable: false,
    defaultMessage: "Session data is incomplete. Missing required fields.",
  },
  SESSION_KEY_LOW_BALANCE: {
    code: "SESSION_KEY_LOW_BALANCE",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: true,
    defaultMessage: "Session key balance too low for execution.",
  },
  INSUFFICIENT_BALANCE: {
    code: "INSUFFICIENT_BALANCE",
    class: "Execution",
    module: "Execution",
    severity: "error",
    retriable: false,
    defaultMessage: "Insufficient balance for operation.",
  },
  TOKEN_NOT_FOUND: {
    code: "TOKEN_NOT_FOUND",
    class: "Intent",
    module: "Intent",
    severity: "error",
    retriable: false,
    defaultMessage: "Token not found in allowed list.",
  },
  TOKEN_NOT_IN_ALLOWLIST: {
    code: "TOKEN_NOT_IN_ALLOWLIST",
    class: "Policy",
    module: "Intent",
    severity: "error",
    retriable: false,
    defaultMessage: "Token is not in the allowlist.",
  },
  INVALID_ADDRESS: {
    code: "INVALID_ADDRESS",
    class: "Intent",
    module: "Intent",
    severity: "error",
    retriable: false,
    defaultMessage: "Invalid address format.",
  },
  SIM_ALLOWANCE_TOO_LOW: {
    code: "SIM_ALLOWANCE_TOO_LOW",
    class: "Simulation",
    module: "Simulation",
    severity: "error",
    retriable: true,
    defaultMessage: "Allowance too low for requested amount.",
  },
  SIM_BALANCE_TOO_LOW: {
    code: "SIM_BALANCE_TOO_LOW",
    class: "Simulation",
    module: "Simulation",
    severity: "error",
    retriable: true,
    defaultMessage: "Balance too low for requested amount.",
  },
  SIM_DEADLINE_EXPIRED: {
    code: "SIM_DEADLINE_EXPIRED",
    class: "Simulation",
    module: "Simulation",
    severity: "error",
    retriable: true,
    defaultMessage: "Deadline expired before execution.",
  },
  SIM_GAS_ESTIMATE_FAILED: {
    code: "SIM_GAS_ESTIMATE_FAILED",
    class: "Simulation",
    module: "Simulation",
    severity: "error",
    retriable: true,
    defaultMessage: "Failed to estimate gas for plan.",
  },
  SIM_MIN_OUT_NOT_MET: {
    code: "SIM_MIN_OUT_NOT_MET",
    class: "Simulation",
    module: "Simulation",
    severity: "error",
    retriable: true,
    defaultMessage: "Minimum output not satisfied.",
  },
  SIM_POLICY_CAP_EXCEEDED: {
    code: "SIM_POLICY_CAP_EXCEEDED",
    class: "Policy",
    module: "Simulation",
    severity: "error",
    retriable: false,
    defaultMessage: "Policy cap exceeded during simulation.",
  },
  SIM_PREVIEW_EXPIRED: {
    code: "SIM_PREVIEW_EXPIRED",
    class: "Simulation",
    module: "Simulation",
    severity: "error",
    retriable: true,
    defaultMessage: "Delegation or preview expired.",
  },
  SIM_QUOTE_DRIFT_TOO_HIGH: {
    code: "SIM_QUOTE_DRIFT_TOO_HIGH",
    class: "Simulation",
    module: "Simulation",
    severity: "warn",
    retriable: true,
    defaultMessage: "Quote drift exceeds allowed tolerance.",
  },
  SIM_ROUTE_REVERT: {
    code: "SIM_ROUTE_REVERT",
    class: "Simulation",
    module: "Simulation",
    severity: "error",
    retriable: true,
    defaultMessage: "Route simulation reverted.",
  },
  SIM_RPC_ERROR: {
    code: "SIM_RPC_ERROR",
    class: "Infra",
    module: "Simulation",
    severity: "error",
    retriable: true,
    defaultMessage: "Simulation RPC call failed.",
  },
  SAME_TOKEN_PAIR: {
    code: "SAME_TOKEN_PAIR",
    class: "Intent",
    module: "Intent",
    severity: "error",
    retriable: false,
    defaultMessage: "Cannot swap the same token pair.",
  },
  TIMEOUT: {
    code: "TIMEOUT",
    class: "Infra",
    module: "Common",
    severity: "error",
    retriable: true,
    defaultMessage: "Operation timed out.",
  },
  TOKEN_OUT_OF_SCOPE: {
    code: "TOKEN_OUT_OF_SCOPE",
    class: "Policy",
    module: "Intent",
    severity: "error",
    retriable: false,
    defaultMessage: "Token is outside the delegated scope.",
  },
  TOKEN_UNRESOLVED: {
    code: "TOKEN_UNRESOLVED",
    class: "Intent",
    module: "Intent",
    severity: "error",
    retriable: false,
    defaultMessage: "Token symbol or address could not be resolved.",
  },
  UNSUPPORTED_CHAIN: {
    code: "UNSUPPORTED_CHAIN",
    class: "Infra",
    module: "Common",
    severity: "fatal",
    retriable: false,
    defaultMessage: "Unsupported chain.",
  },
} as const;

export type PragmaErrorCode = keyof typeof ERROR_DEFINITIONS;

export const assertKnownErrorCode = (code: string): asserts code is PragmaErrorCode => {
  if (!(code in ERROR_DEFINITIONS)) {
    throw new Error(`Unknown Pragma error code: ${code}`);
  }
};

export const createError = ({
  code,
  message,
  class: errorClass,
  module,
  retriable,
  severity,
  context,
  cause,
}: CreateErrorParams): PragmaError => {
  const error = new Error(message);
  Object.assign(error, {
    name: "PragmaError",
    code,
    class: errorClass,
    module,
    retriable,
    severity,
    context,
    cause,
  });
  return error as PragmaError;
};

export interface CreateErrorFromCodeOptions {
  message?: string;
  context?: PragmaErrorContext;
  cause?: unknown;
  class?: PragmaErrorClass;
  module?: PragmaErrorModule;
  severity?: PragmaErrorSeverity;
  retriable?: boolean;
}

export const createErrorFromCode = (
  code: PragmaErrorCode,
  options: CreateErrorFromCodeOptions = {},
): PragmaError => {
  const definition = ERROR_DEFINITIONS[code];

  // Defensive check: if error definition doesn't exist, create a generic error
  if (!definition) {
    console.warn(`[Pragma] Unknown error code: ${code}. Please add it to ERROR_DEFINITIONS.`);
    return createError({
      code,
      message: options.message ?? `Unknown error: ${code}`,
      class: options.class ?? "Execution",
      module: options.module ?? "Common",
      retriable: options.retriable ?? false,
      severity: options.severity ?? "error",
      context: options.context,
      cause: options.cause,
    });
  }

  const message = options.message ?? definition.defaultMessage;
  return createError({
    code,
    message,
    class: options.class ?? definition.class,
    module: options.module ?? definition.module,
    retriable: options.retriable ?? definition.retriable,
    severity: options.severity ?? definition.severity,
    context: options.context,
    cause: options.cause,
  });
};

export const isPragmaError = (value: unknown): value is PragmaError => {
  if (!value || typeof value !== "object") return false;
  return (
    "code" in value &&
    "class" in value &&
    "module" in value &&
    "retriable" in value &&
    "severity" in value
  );
};

export const toPlainError = (error: unknown): Record<string, unknown> => {
  if (!error || typeof error !== "object") {
    return { message: String(error) };
  }

  const base: Record<string, unknown> = {
    name: (error as Error).name,
    message: (error as Error).message,
    stack: (error as Error).stack,
  };

  if (isPragmaError(error)) {
    base.code = error.code;
    base.class = error.class;
    base.module = error.module;
    base.retriable = error.retriable;
    base.severity = error.severity;
    if (error.context) base.context = error.context;
  }

  return base;
};
