/**
 * Production-Safe Logger Utility
 *
 * Provides environment-aware logging that suppresses debug/info logs in production
 * while keeping warn/error logs for monitoring.
 *
 * Works in both browser (Next.js) and Node.js (core package) environments.
 *
 * @example
 * ```typescript
 * import { createLogger } from '@pragma/core';
 *
 * const logger = createLogger('[MyModule]');
 *
 * logger.debug('Detailed info', { data }); // Suppressed in production
 * logger.info('General info');              // Suppressed in production
 * logger.warn('Warning message');           // Always logged
 * logger.error('Error occurred', error);    // Always logged
 * ```
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerOptions {
  /** Prefix for all log messages (e.g., "[Monorail]") */
  prefix?: string;
  /** Force enable/disable regardless of environment */
  enabled?: boolean;
  /** Minimum level to log (default: 'debug' in dev, 'warn' in prod) */
  minLevel?: LogLevel;
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Check if running in development mode.
 * Works in both browser (Next.js) and Node.js environments.
 */
export function isDevelopment(): boolean {
  // Browser (Next.js) - check window and process.env
  if (typeof window !== "undefined") {
    // Next.js inlines NODE_ENV at build time
    return process.env.NODE_ENV !== "production";
  }

  // Node.js - check process.env directly
  if (typeof process !== "undefined" && process.env) {
    return process.env.NODE_ENV !== "production";
  }

  // Fallback: assume production for safety
  return false;
}

/**
 * Check if running in production mode.
 */
export function isProduction(): boolean {
  return !isDevelopment();
}

/**
 * Get the default minimum log level based on environment.
 * - Development: 'debug' (all logs)
 * - Production: 'warn' (only warnings and errors)
 */
function getDefaultMinLevel(): LogLevel {
  return isProduction() ? "warn" : "debug";
}

/**
 * No-op function for suppressed log levels
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop = (..._args: unknown[]): void => {};

/**
 * Create a logger instance with environment-aware behavior.
 *
 * Production behavior:
 * - debug/info: suppressed (no-op)
 * - warn/error: logged (for monitoring/debugging)
 *
 * Development behavior:
 * - All levels logged
 *
 * @param options - Logger configuration options
 * @returns Logger instance with debug, info, warn, error methods
 */
export function createLogger(options: LoggerOptions | string = {}): Logger {
  // Handle shorthand: createLogger('[Prefix]') === createLogger({ prefix: '[Prefix]' })
  const opts = typeof options === "string" ? { prefix: options } : options;

  const prefix = opts.prefix ? `${opts.prefix} ` : "";
  const enabled = opts.enabled ?? true;
  const minLevel = opts.minLevel ?? getDefaultMinLevel();
  const minLevelNum = LOG_LEVELS[minLevel];

  const shouldLog = (level: LogLevel): boolean => {
    if (!enabled) return false;
    return LOG_LEVELS[level] >= minLevelNum;
  };

  return {
    debug: shouldLog("debug")
      ? (message: string, ...args: unknown[]) =>
          console.debug(`${prefix}${message}`, ...args)
      : noop,

    info: shouldLog("info")
      ? (message: string, ...args: unknown[]) =>
          console.log(`${prefix}${message}`, ...args)
      : noop,

    warn: shouldLog("warn")
      ? (message: string, ...args: unknown[]) =>
          console.warn(`${prefix}${message}`, ...args)
      : noop,

    error: shouldLog("error")
      ? (message: string, ...args: unknown[]) =>
          console.error(`${prefix}${message}`, ...args)
      : noop,
  };
}

/**
 * Pre-configured logger for the core package.
 * Uses "[Pragma Core]" prefix.
 */
export const coreLogger = createLogger("[Pragma Core]");
