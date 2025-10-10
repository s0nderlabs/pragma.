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

