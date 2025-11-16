import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const projectDir = new URL(".", import.meta.url).pathname;
loadEnvConfig(projectDir, true);

const nextConfig: NextConfig = {
  // Turbopack configuration for LangChain browser compatibility
  turbopack: {
    resolveAlias: {
      // Map Node.js async_hooks to our browser polyfill
      // This allows LangChain to import AsyncLocalStorage in the browser
      'async_hooks': './src/lib/polyfills/async-local-storage.ts',
      'node:async_hooks': './src/lib/polyfills/async-local-storage.ts',
    },
  },
} satisfies NextConfig;

export default nextConfig;
