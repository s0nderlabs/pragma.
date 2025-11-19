/**
 * Progress Event Emitter
 *
 * Allows H2 tools to emit real-time progress updates during execution.
 * Used for dynamic status messages in CLI (Claude Code-style animation).
 *
 * Example usage in tools:
 * ```typescript
 * import { emitProgress } from '../progress/emitter.js';
 *
 * emitProgress(`Checking ${token} balance...`);
 * emitProgress(`Executing swap via ${protocol}...`);
 * ```
 */

import { EventEmitter } from "events";

// ============================================================================
// Types
// ============================================================================

export interface ProgressEvent {
  message: string;
  timestamp: number;
  toolName?: string;
  signature?: string; // Unique identifier for parallel tool matching (e.g., "MON-DAK")
}

// ============================================================================
// Global Progress Emitter
// ============================================================================

// Use global symbol to ensure single instance across all imports
// This prevents bundler from creating multiple module instances
const EMITTER_KEY = Symbol.for('@pragma/core/progress-emitter');

/**
 * Singleton event emitter for tool progress updates
 */
class ProgressEmitter extends EventEmitter {
  private __instanceId: string;

  constructor() {
    super();
    // Set max listeners to avoid warnings in multi-step operations
    this.setMaxListeners(100);
    // Instance ID for debugging
    this.__instanceId = Math.random().toString(36).substr(2, 9);
  }

  /**
   * Emit a progress update
   */
  emitProgress(message: string, toolName?: string, signature?: string): void {
    console.log(`[Emitter:${this.__instanceId}] Emit:`, signature || toolName || message.slice(0, 30));
    const event: ProgressEvent = {
      message,
      timestamp: Date.now(),
      toolName,
      signature,
    };
    this.emit("progress", event);
  }

  /**
   * Subscribe to progress updates
   */
  onProgress(callback: (event: ProgressEvent) => void): void {
    console.log(`[Emitter:${this.__instanceId}] Subscribe`);
    this.on("progress", callback);
  }

  /**
   * Unsubscribe from progress updates
   */
  offProgress(callback: (event: ProgressEvent) => void): void {
    this.off("progress", callback);
  }

  /**
   * Clear all progress listeners
   */
  clearProgressListeners(): void {
    this.removeAllListeners("progress");
  }
}

/**
 * Get the global progress emitter instance
 * Uses globalThis to ensure single instance regardless of import path
 */
function getGlobalEmitter(): ProgressEmitter {
  const g = globalThis as unknown as { [key: symbol]: ProgressEmitter };
  if (!g[EMITTER_KEY]) {
    g[EMITTER_KEY] = new ProgressEmitter();
  }
  return g[EMITTER_KEY];
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Get the global progress emitter instance
 */
export const getProgressEmitter = (): ProgressEmitter => {
  return getGlobalEmitter();
};

/**
 * Emit a progress update from within a tool
 *
 * @param message - Human-readable progress message with contextual data
 * @param toolName - Optional tool name (auto-detected if possible)
 * @param signature - Optional unique identifier for parallel tool matching (e.g., "MON-DAK")
 *
 * @example
 * ```typescript
 * emitProgress(`Swapping 2.0 USDC → MON via Monorail...`);
 * emitProgress(`Building delegation with 5% slippage protection...`);
 * emitProgress(`Executing swap...`, 'executeSwap', 'MON-USDC');
 * ```
 */
export const emitProgress = (message: string, toolName?: string, signature?: string): void => {
  const emitter = getProgressEmitter();
  emitter.emitProgress(message, toolName, signature);
};

/**
 * Subscribe to progress updates (for CLI rendering)
 *
 * @param callback - Function to call when progress is emitted
 *
 * @example
 * ```typescript
 * onProgress((event) => {
 *   console.log(`⚡ ${event.message}`);
 * });
 * ```
 */
export const onProgress = (callback: (event: ProgressEvent) => void): void => {
  const emitter = getProgressEmitter();
  emitter.onProgress(callback);
};

/**
 * Unsubscribe from progress updates
 */
export const offProgress = (callback: (event: ProgressEvent) => void): void => {
  const emitter = getProgressEmitter();
  emitter.offProgress(callback);
};

/**
 * Clear all progress listeners (cleanup)
 */
export const clearProgressListeners = (): void => {
  const emitter = getProgressEmitter();
  emitter.clearProgressListeners();
};
