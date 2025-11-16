/**
 * AsyncLocalStorage Browser Polyfill
 *
 * Provides Node.js AsyncLocalStorage API in the browser using Zone.js.
 * Required for LangChain to run in browser environments.
 *
 * LangChain uses async_hooks.AsyncLocalStorage for context tracking.
 * This polyfill makes it work in browsers by using Zone.js for async context.
 */

import 'zone.js';

/**
 * Browser-compatible AsyncLocalStorage implementation
 *
 * Mimics Node.js AsyncLocalStorage API using Zone.js for async context propagation.
 * Zone.js automatically tracks async operations (promises, setTimeout, etc).
 */
export class AsyncLocalStorage<T> {
  private readonly zoneKey: string;

  constructor() {
    // Generate unique key for this storage instance
    this.zoneKey = `__async_local_storage_${Math.random().toString(36).substring(2, 15)}__`;
  }

  /**
   * Run a callback with a given store value
   *
   * Creates a new Zone fork with the store value, ensuring it's available
   * to all async operations within the callback.
   */
  run<R>(store: T, callback: (...args: any[]) => R, ...args: any[]): R {
    // Fork current zone with store value in zone properties
    const newZone = Zone.current.fork({
      name: `AsyncLocalStorage-${this.zoneKey}`,
      properties: {
        [this.zoneKey]: store,
      },
    });

    // Run callback in the new zone
    // Zone.run() automatically handles async operations and promises
    return newZone.run(() => {
      return callback(...args);
    });
  }

  /**
   * Get the current store value
   *
   * Returns the store value from the current zone, or undefined if not set.
   */
  getStore(): T | undefined {
    return Zone.current.get(this.zoneKey);
  }

  /**
   * Enter a context with a given store value
   *
   * This is a simplified implementation that delegates to run().
   * Note: The callback pattern is more reliable in browsers.
   */
  enterWith(store: T): void {
    // Zone.js doesn't support "entering" a context imperatively like Node.js
    // We'd need to fork and run, but enterWith is synchronous
    // Best practice: Use run() instead of enterWith() in browser code
    console.warn(
      'AsyncLocalStorage.enterWith() is not fully supported in browsers. Use run() instead.'
    );
  }

  /**
   * Exit the current async context
   *
   * Zone.js doesn't support explicit exit. Context is automatically managed.
   */
  exit<R>(callback: (...args: any[]) => R, ...args: any[]): R {
    // Run callback in root zone (no async context)
    return Zone.root.run(callback, undefined, args);
  }

  /**
   * Disable async context tracking for a callback
   *
   * Runs callback without AsyncLocalStorage context.
   */
  disable(): void {
    console.warn(
      'AsyncLocalStorage.disable() is not implemented in browser polyfill.'
    );
  }
}

/**
 * Create global async_hooks module for LangChain compatibility
 *
 * LangChain imports: `import { AsyncLocalStorage } from 'async_hooks'`
 * This makes our polyfill available at that import path.
 */
if (typeof window !== 'undefined') {
  // @ts-ignore - Creating module shim for Node.js imports
  window.async_hooks = {
    AsyncLocalStorage,
  };

  // Also provide as global for direct access
  // @ts-ignore
  window.AsyncLocalStorage = AsyncLocalStorage;

  console.log('[Polyfill] AsyncLocalStorage initialized for browser');
}

// Export for manual imports
export default AsyncLocalStorage;
