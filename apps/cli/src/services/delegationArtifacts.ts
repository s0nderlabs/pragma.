import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { Delegation } from "@metamask/delegation-toolkit";

import { DelegationArtifact } from "./onboarding4337.js";

const ARTIFACT_PREFIX = "delegation-4337-";
const ARTIFACT_DIR = path.join(os.homedir(), ".pragma");

export interface LoadedDelegationArtifact {
  artifact: DelegationArtifact;
  filePath: string;
}

const deriveExpiresAt = (delegation: Delegation): number | undefined => {
  for (const caveat of delegation.caveats ?? []) {
    if (!caveat.terms || caveat.terms.length !== 66) continue;
    const value = BigInt(caveat.terms);
    if (value > 0n) {
      return Number(value);
    }
  }
  return undefined;
};

const readArtifact = async (filePath: string): Promise<DelegationArtifact> => {
  const contents = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(contents) as DelegationArtifact;
  if (!parsed.delegation) {
    throw new Error(`Invalid delegation artifact: missing delegation field (${filePath})`);
  }
  if (!parsed.expiresAt) {
    const derived = deriveExpiresAt(parsed.delegation);
    if (derived) parsed.expiresAt = derived;
  }
  return parsed;
};

const selectLatestArtifactPath = async (): Promise<string | undefined> => {
  let entries: string[];
  try {
    entries = await fs.readdir(ARTIFACT_DIR);
  } catch (error: any) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }

  const candidates = entries
    .filter((name) => name.startsWith(ARTIFACT_PREFIX) && name.endsWith(".json"))
    .map((name) => path.join(ARTIFACT_DIR, name));

  if (candidates.length === 0) return undefined;

  const stats = await Promise.all(
    candidates.map(async (filePath) => {
      const stat = await fs.stat(filePath);
      return { filePath, mtime: stat.mtimeMs };
    }),
  );

  stats.sort((a, b) => b.mtime - a.mtime);
  return stats[0]?.filePath;
};

export const loadDelegationArtifact = async (filePath?: string): Promise<LoadedDelegationArtifact> => {
  const resolvedPath = filePath ?? (await selectLatestArtifactPath());
  if (!resolvedPath) {
    throw new Error("No delegation artifacts found under ~/.pragma. Run onboarding first.");
  }

  const artifact = await readArtifact(resolvedPath);
  if (!artifact.expiresAt) {
    throw new Error("Unable to determine delegation expiry timestamp from artifact.");
  }

  return { artifact, filePath: resolvedPath };
};

export const isDelegationExpired = (artifact: DelegationArtifact): boolean => {
  const expiry = artifact.expiresAt ?? deriveExpiresAt(artifact.delegation);
  if (!expiry) return false;
  return Math.floor(Date.now() / 1000) >= expiry;
};
