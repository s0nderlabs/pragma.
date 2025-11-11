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
}

// ============================================================================
// Global Progress Emitter
// ============================================================================

/**
 * Singleton event emitter for tool progress updates
 */
class ProgressEmitter extends EventEmitter {
  private static instance: ProgressEmitter;

  private constructor() {
    super();
    // Set max listeners to avoid warnings in multi-step operations
    this.setMaxListeners(100);
  }

  static getInstance(): ProgressEmitter {
    if (!ProgressEmitter.instance) {
      ProgressEmitter.instance = new ProgressEmitter();
    }
    return ProgressEmitter.instance;
  }

  /**
   * Emit a progress update
   */
  emitProgress(message: string, toolName?: string): void {
    const event: ProgressEvent = {
      message,
      timestamp: Date.now(),
      toolName,
    };
    this.emit("progress", event);
  }

  /**
   * Subscribe to progress updates
   */
  onProgress(callback: (event: ProgressEvent) => void): void {
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

// ============================================================================
// Exports
// ============================================================================

/**
 * Get the global progress emitter instance
 */
export const getProgressEmitter = (): ProgressEmitter => {
  return ProgressEmitter.getInstance();
};

/**
 * Emit a progress update from within a tool
 *
 * @param message - Human-readable progress message with contextual data
 * @param toolName - Optional tool name (auto-detected if possible)
 *
 * @example
 * ```typescript
 * emitProgress(`Swapping 2.0 USDC → MON via Monorail...`);
 * emitProgress(`Building delegation with 5% slippage protection...`);
 * emitProgress(`Executing swap...`);
 * ```
 */
export const emitProgress = (message: string, toolName?: string): void => {
  const emitter = getProgressEmitter();
  emitter.emitProgress(message, toolName);
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
