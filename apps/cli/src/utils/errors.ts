import chalk from "chalk";

import {
  createErrorFromCode,
  isPragmaError,
  toPlainError,
  type PragmaError,
} from "@pragma/core";

export interface CliErrorRenderOptions {
  prefix?: string;
  stream?: "stdout" | "stderr";
}

export const normalizePragmaError = (error: unknown): PragmaError => {
  if (isPragmaError(error)) {
    return error;
  }

  if (error instanceof Error && error.message) {
    return createErrorFromCode("INTERNAL_ASSERTION_FAILED", {
      message: error.message,
      cause: error,
    });
  }

  return createErrorFromCode("INTERNAL_ASSERTION_FAILED", {
    message: "Unknown error encountered.",
    cause: error,
  });
};

export const formatPragmaError = (error: PragmaError): string =>
  `[${error.code}] ${error.message}`;

export const logPragmaError = (
  error: unknown,
  options: CliErrorRenderOptions = {},
): PragmaError => {
  const normalized = normalizePragmaError(error);
  const prefix = options.prefix ? `${options.prefix} ` : "";
  const line = `${prefix}${formatPragmaError(normalized)}`;
  const stream = options.stream === "stdout" ? process.stdout : process.stderr;
  stream.write(`${chalk.red(line)}\n`);
  return normalized;
};

export const serializePragmaError = (error: unknown) => {
  const normalized = normalizePragmaError(error);
  return {
    ...toPlainError(normalized),
    retriable: normalized.retriable,
    severity: normalized.severity,
  };
};
