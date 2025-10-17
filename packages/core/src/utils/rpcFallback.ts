import {
  ContractFunctionExecutionError,
  InvalidParamsRpcError,
  RpcRequestError,
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

const shouldRetryWithFallback = (error: unknown): boolean => {
  const candidate = unwrapError(error);
  return isRpcParamError(candidate);
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
