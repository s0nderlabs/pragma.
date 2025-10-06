import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { Delegation } from "@metamask/delegation-toolkit";
import { Address, Hex, concatHex, getAddress, keccak256, recoverTypedDataAddress } from "viem";
import { sepolia } from "viem/chains";
import type { PublicClient } from "viem";
import type { DeleGatorEnv } from "./onboarding4337.js";

import { DelegationArtifact, DEFAULT_CALL_LIMITS, normalizeAllowedTokensList, type Mode } from "./onboarding4337.js";
import { buildDelegationTypedData } from "./delegationTypedData.js";

const ARTIFACT_PREFIX = "delegation-4337-";
const LEGACY_ARTIFACT_DIR = path.join(os.homedir(), ".pragma");
const TEST_DELEGATIONS_BASE_DIR = process.env.PRAGMA_DELEGATION_DIR
  ? path.join(process.env.PRAGMA_DELEGATION_DIR)
  : path.join(LEGACY_ARTIFACT_DIR, "test-delegations");

const ERC1271_ABI = [
  {
    type: "function",
    name: "isValidSignature",
    stateMutability: "view",
    inputs: [
      { name: "hash", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "magicValue", type: "bytes4" }],
  },
] as const;

const DELEGATION_MANAGER_ABI = [
  {
    type: "function",
    name: "getDomainHash",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "domainHash", type: "bytes32" }],
  },
  {
    type: "function",
    name: "getDelegationHash",
    stateMutability: "view",
    inputs: [
      {
        name: "delegation",
        type: "tuple",
        components: [
          { name: "delegate", type: "address" },
          { name: "delegator", type: "address" },
          { name: "authority", type: "bytes32" },
          {
            name: "caveats",
            type: "tuple[]",
            components: [
              { name: "enforcer", type: "address" },
              { name: "terms", type: "bytes" },
              { name: "args", type: "bytes" },
            ],
          },
          { name: "salt", type: "uint256" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "delegationHash", type: "bytes32" }],
  },
] as const;

const ERC1271_MAGIC_VALUE = "0x1626ba7e";

export interface LoadedDelegationArtifact {
  artifact: DelegationArtifact;
  filePath: string;
  delegator?: Address;
}

export interface DelegationSignatureDiagnosis {
  valid: boolean;
  recoveredSigner?: Address;
  expectedSigner?: Address;
  reason?: string;
}

interface ArtifactFileMeta {
  filePath: string;
  mtime: number;
  timestamp: number;
  delegator?: string;
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
  if (!parsed.sessionNonce) {
    parsed.sessionNonce = "0x0";
  }
  if (typeof parsed.callLimit === "string") {
    const coerced = Number(parsed.callLimit);
    parsed.callLimit = Number.isFinite(coerced) ? coerced : undefined;
  }
  if (parsed.callsUnlimited === undefined) {
    parsed.callsUnlimited = false;
  }
  if (!Array.isArray(parsed.allowedTokens)) {
    parsed.allowedTokens = [];
  } else {
    parsed.allowedTokens = parsed.allowedTokens.map((token) => {
      try {
        return {
          address: getAddress(token.address),
          symbol: token.symbol,
          decimals: typeof token.decimals === "number" ? token.decimals : Number(token.decimals ?? 18),
        };
      } catch {
        return {
          address: getAddress(token.address as string),
          symbol: token.symbol,
          decimals: 18,
        };
      }
    });
  }
  parsed.allowedTokens = normalizeAllowedTokensList(parsed.allowedTokens);
  if (!parsed.expiresAt) {
    const derived = deriveExpiresAt(parsed.delegation);
    if (derived) parsed.expiresAt = derived;
  }
  return parsed;
};

const readDirEntries = async (dir: string) => {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
};

const collectArtifactFiles = async (): Promise<ArtifactFileMeta[]> => {
  const metas: ArtifactFileMeta[] = [];

  const delegatorDirs = await readDirEntries(TEST_DELEGATIONS_BASE_DIR);

  for (const dirent of delegatorDirs) {
    if (!dirent.isDirectory()) continue;
    const delegatorDirName = dirent.name.toLowerCase();
    const delegatorPath = path.join(TEST_DELEGATIONS_BASE_DIR, delegatorDirName);
    const sessionFiles = await readDirEntries(delegatorPath);

    for (const fileDirent of sessionFiles) {
      if (!fileDirent.isFile()) continue;
      const match = fileDirent.name.match(/session-(\d+)\.json$/);
      if (!match) continue;
      const timestamp = Number(match[1]);
      const filePath = path.join(delegatorPath, fileDirent.name);
      try {
        const stat = await fs.stat(filePath);
        let delegator: string | undefined;
        try {
          delegator = getAddress(delegatorDirName);
        } catch {
          delegator = undefined;
        }
        metas.push({ filePath, mtime: stat.mtimeMs, timestamp, delegator });
      } catch {
        continue;
      }
    }
  }

  if (metas.length === 0) {
    const legacyEntries = await readDirEntries(LEGACY_ARTIFACT_DIR);
    for (const fileDirent of legacyEntries) {
      if (!fileDirent.isFile() || !fileDirent.name.startsWith(ARTIFACT_PREFIX) || !fileDirent.name.endsWith(".json")) {
        continue;
      }
      const match = fileDirent.name.match(/delegation-4337-(\d+)\.json$/);
      const timestamp = match ? Number(match[1]) : 0;
      const filePath = path.join(LEGACY_ARTIFACT_DIR, fileDirent.name);
      try {
        const stat = await fs.stat(filePath);
        metas.push({ filePath, mtime: stat.mtimeMs, timestamp });
      } catch {
        continue;
      }
    }
  }

  metas.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    return b.mtime - a.mtime;
  });

  return metas;
};

const selectLatestArtifactPath = async (): Promise<string | undefined> => {
  const metas = await collectArtifactFiles();
  return metas[0]?.filePath;
};

export const listDelegationArtifacts = async (delegatorFilter?: string): Promise<LoadedDelegationArtifact[]> => {
  const metas = await collectArtifactFiles();
  const normalizedFilter = delegatorFilter ? getAddress(delegatorFilter) : undefined;
  const results: LoadedDelegationArtifact[] = [];
  for (const { filePath } of metas) {
    const artifact = await readArtifact(filePath);
    if (!artifact.expiresAt) {
      const derived = deriveExpiresAt(artifact.delegation);
      if (derived) artifact.expiresAt = derived;
    }
    let delegator: Address | undefined;
    try {
      delegator = getAddress(artifact.delegation.delegator);
    } catch {
      delegator = undefined;
    }
    if (normalizedFilter && delegator && delegator !== normalizedFilter) continue;
    results.push({ artifact, filePath, delegator });
  }
  return results;
};

export const loadDelegationArtifact = async (filePath?: string): Promise<LoadedDelegationArtifact> => {
  const resolvedPath = filePath ?? (await selectLatestArtifactPath());
  if (!resolvedPath) {
    throw new Error("No delegation artifacts found under ~/.pragma. Run onboarding first.");
  }

  const artifact = await readArtifact(resolvedPath);
  if (!artifact.expiresAt) {
    const derived = deriveExpiresAt(artifact.delegation);
    if (derived) artifact.expiresAt = derived;
  }
  let delegator: Address | undefined;
  try {
    delegator = getAddress(artifact.delegation.delegator);
  } catch {
    delegator = undefined;
  }

  return { artifact, filePath: resolvedPath, delegator };
};

export const isDelegationExpired = (artifact: DelegationArtifact): boolean => {
  const expiry = artifact.expiresAt ?? deriveExpiresAt(artifact.delegation);
  if (!expiry) return false;
  return Math.floor(Date.now() / 1000) >= expiry;
};

export const loadLatestActiveDelegation = async (
  delegatorFilter?: string,
  modeFilter?: Mode,
): Promise<LoadedDelegationArtifact> => {
  const metas = await collectArtifactFiles();
  const now = Math.floor(Date.now() / 1000);
  const normalizedFilter = delegatorFilter ? getAddress(delegatorFilter) : undefined;
  const candidates: LoadedDelegationArtifact[] = [];

  for (const { filePath } of metas) {
    const entry = await loadDelegationArtifact(filePath);
    const { artifact } = entry;
    const artifactDelegator = (() => {
      try {
        return getAddress(artifact.delegation.delegator);
      } catch {
        return undefined;
      }
    })();
    if (normalizedFilter && artifactDelegator !== normalizedFilter) continue;
    if (modeFilter && artifact.mode !== modeFilter) continue;
    const expiry = artifact.expiresAt ?? deriveExpiresAt(artifact.delegation);
    if (expiry && expiry <= now) continue;
    if (!artifact.sessionKeyPrivateKey) continue;
    const resolvedEntry = { ...entry, delegator: artifactDelegator };
    if (normalizedFilter) {
      return resolvedEntry;
    }
    candidates.push(resolvedEntry);
  }

  if (normalizedFilter) {
    throw new Error(`No active delegation artifacts found for ${normalizedFilter}. Issue a new delegation before swapping.`);
  }

  if (candidates.length === 0) {
    throw new Error("No active delegation artifacts found. Issue a new delegation before swapping.");
  }

  if (candidates.length > 1) {
    const addresses = candidates
      .map((entry) => entry.delegator ?? entry.artifact.delegation.delegator)
      .join(", ");
    throw new Error(
      `Multiple active delegations detected (${addresses}). Please specify --delegator to select which HybridDelegator to use.`,
    );
  }

  return candidates[0];
};

const OWNER_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "owner", type: "address" }],
  },
] as const;

const getHybridOwner = async (
  publicClient: PublicClient,
  delegator: Address,
): Promise<Address | undefined> => {
  try {
    return (await publicClient.readContract({ address: delegator, abi: OWNER_ABI, functionName: "owner" })) as Address;
  } catch {
    return undefined;
  }
};

export const diagnoseDelegationSignature = async (
  publicClient: PublicClient,
  environment: DeleGatorEnv,
  artifact: DelegationArtifact,
): Promise<DelegationSignatureDiagnosis> => {
  const delegator = getAddress(artifact.delegation.delegator);
  const code = await publicClient.getBytecode({ address: delegator });
  if (!code || code === "0x") {
    // EOA delegators rely on ECDSA verification; assume valid here.
    return { valid: true };
  }

  try {
    const normalizedDelegation = {
      delegate: getAddress(artifact.delegation.delegate),
      delegator,
      authority: artifact.delegation.authority as Hex,
      caveats: (artifact.delegation.caveats ?? []).map((caveat) => ({
        enforcer: getAddress(caveat.enforcer),
        terms: caveat.terms as Hex,
        args: (caveat.args ?? "0x") as Hex,
      })),
      salt: BigInt(artifact.delegation.salt ?? "0x0"),
      signature: artifact.delegation.signature as Hex,
    };

    const delegationHash = (await publicClient.readContract({
      address: environment.DelegationManager as Address,
      abi: DELEGATION_MANAGER_ABI,
      functionName: "getDelegationHash",
      args: [normalizedDelegation],
    })) as Hex;
    const domainHash = (await publicClient.readContract({
      address: environment.DelegationManager as Address,
      abi: DELEGATION_MANAGER_ABI,
      functionName: "getDomainHash",
    })) as Hex;

    const typedDataHash = keccak256(
      concatHex(["0x1901" as Hex, domainHash, delegationHash as Hex]),
    );

    const result = (await publicClient.readContract({
      address: delegator,
      abi: ERC1271_ABI,
      functionName: "isValidSignature",
      args: [typedDataHash as Hex, artifact.delegation.signature as Hex],
    })) as Hex;

    if (result.toLowerCase() === ERC1271_MAGIC_VALUE) {
      return { valid: true };
    }

    const chainId = publicClient.chain?.id ?? sepolia.id;
    const verifyingContract = environment.DelegationManager as Address;
    let recovered: Address | undefined;
    try {
      const typedData = buildDelegationTypedData(artifact.delegation, chainId, verifyingContract);
      recovered = await recoverTypedDataAddress({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message as any,
        signature: artifact.delegation.signature as Hex,
      });
    } catch {
      recovered = undefined;
    }

    const expectedSigner = await getHybridOwner(publicClient, delegator);
    return {
      valid: false,
      recoveredSigner: recovered,
      expectedSigner,
      reason: "ERC-1271 check returned failure",
    };
  } catch (error) {
    const expectedSigner = await getHybridOwner(publicClient, delegator);
    return {
      valid: false,
      expectedSigner,
      reason: error instanceof Error ? error.message : "Signature validation threw",
    };
  }
};

export const isDelegationSignatureValid = async (
  publicClient: PublicClient,
  environment: DeleGatorEnv,
  artifact: DelegationArtifact,
): Promise<boolean> => {
  const result = await diagnoseDelegationSignature(publicClient, environment, artifact);
  return result.valid;
};
