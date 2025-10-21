import {
  ContractFunctionExecutionError,
  InvalidParamsRpcError,
  RpcRequestError,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  WaitForTransactionReceiptTimeoutError,
  type PublicClient,
} from "viem";

const unwrapError = (error: unknown): unknown => {
  if (error instanceof ContractFunctionExecutionError && error.cause) {
    return error.cause;
  }
  return error;
};

const extractMessage = (error: unknown): string => {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  return String(error);
};

const isRpcParamError = (error: unknown): boolean => {
  if (!error) return false;
  if (error instanceof InvalidParamsRpcError) return true;
  if (error instanceof RpcRequestError) {
    const message = extractMessage(error);
    return /invalid parameters/i.test(message) || /block requested not found/i.test(message);
  }
  const message = extractMessage(error);
  return /invalid parameters were provided/i.test(message) || /block requested not found/i.test(message);
};

const isTimeoutError = (error: unknown): boolean => {
  if (!error) return false;
  if (error instanceof WaitForTransactionReceiptTimeoutError) return true;
  const message = extractMessage(error);
  return /timed out while waiting for transaction/i.test(message);
};

const isTransactionMissingError = (error: unknown): boolean => {
  if (!error) return false;
  if (error instanceof TransactionNotFoundError || error instanceof TransactionReceiptNotFoundError) {
    return true;
  }
  const message = extractMessage(error);
  return /transaction (receipt )?not found/i.test(message);
};

const shouldRetryWithFallback = (error: unknown): boolean => {
  const candidate = unwrapError(error);
  return (
    isRpcParamError(candidate) ||
    isTimeoutError(candidate) ||
    isTransactionMissingError(candidate)
  );
};

/**
 * Retry a function with exponential backoff
 * Useful for handling transient RPC sync lag (e.g., "Block requested not found")
 */
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 500,
): Promise<T> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const candidate = unwrapError(error);
      const isTransient = isRpcParamError(candidate);

      if (!isTransient || isLastAttempt) {
        throw error;
      }

      // Exponential backoff: 500ms, 1000ms, 1500ms
      const delay = baseDelay * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Retry logic failed"); // Should never reach
};

export const callWithRpcFallback = async <T>(
  primary: PublicClient,
  fallback: PublicClient | undefined,
  task: (client: PublicClient) => Promise<T>,
): Promise<T> => {
  try {
    return await task(primary);
  } catch (error) {
    if (!fallback || fallback === primary || !shouldRetryWithFallback(error)) {
      throw error;
    }
    return task(fallback);
  }
};

/**
 * Retry a function with exponential backoff (exported for balance checks)
 * Handles RPC sync lag by retrying with increasing delays
 */
export const callWithRetry = retryWithBackoff;
