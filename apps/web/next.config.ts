import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const projectDir = new URL(".", import.meta.url).pathname;
loadEnvConfig(projectDir, true);

const nextConfig: NextConfig = {} satisfies NextConfig;

export default nextConfig;
