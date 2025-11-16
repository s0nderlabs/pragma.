/**
 * Browser Polyfills for LangChain Compatibility
 *
 * Import this file at the top of your application (before any LangChain imports)
 * to enable LangChain to run in the browser.
 *
 * Usage in Next.js:
 * - Import in app/layout.tsx or app/h2.5/layout.tsx
 * - Must be imported before any LangChain agent code
 *
 * What this provides:
 * - Zone.js for async context tracking
 * - AsyncLocalStorage polyfill for Node.js async_hooks module
 */

// Import zone.js first (provides Zone global)
import 'zone.js';

// Import AsyncLocalStorage polyfill (registers global async_hooks)
import './async-local-storage';

// Log initialization
if (typeof window !== 'undefined') {
  console.log('[Polyfills] Browser polyfills loaded for LangChain compatibility');
}

// Re-export for convenience
export { AsyncLocalStorage } from './async-local-storage';
