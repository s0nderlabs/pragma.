import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getAddress } from "viem";

const BASE_DIR = process.env.PRAGMA_DELEGATION_DIR
  ? path.join(process.env.PRAGMA_DELEGATION_DIR)
  : path.join(os.homedir(), ".pragma");

const SESSION_FILE = path.join(BASE_DIR, "agent-session.json");

const ensureBaseDir = async () => {
  await fs.mkdir(BASE_DIR, { recursive: true });
};

interface SessionStateRaw {
  delegator?: string;
  requireOnboard?: boolean;
  // H2 fields
  sessionKeyAddress?: string;
  sessionKeyPrivateKey?: string;
  ownerAddress?: string;
  chainId?: number;
}

export interface SessionState {
  delegator?: `0x${string}`;
  requireOnboard?: boolean;
  // H2 fields
  sessionKeyAddress?: `0x${string}`;
  sessionKeyPrivateKey?: `0x${string}`;
  ownerAddress?: `0x${string}`;
  chainId?: number;
}

const readSession = async (): Promise<SessionStateRaw | undefined> => {
  try {
    const contents = await fs.readFile(SESSION_FILE, "utf8");
    return JSON.parse(contents) as SessionStateRaw;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return undefined;
    }
    if (err.name === "SyntaxError") {
      const timestamp = Date.now();
      const corruptedPath = `${SESSION_FILE}.corrupted-${timestamp}`;
      try {
        await fs.rename(SESSION_FILE, corruptedPath);
      } catch (renameError) {
        if ((renameError as NodeJS.ErrnoException).code !== "ENOENT") {
          console.warn(`Failed to quarantine corrupted session file: ${(renameError as Error).message}`);
        }
      }
      console.warn(
        `Pragma session cache was corrupted and has been reset (original preserved at ${corruptedPath}).`,
      );
      return undefined;
    }
    throw error;
  }
};

const writeSession = async (state: SessionStateRaw) => {
  await ensureBaseDir();
  await fs.writeFile(SESSION_FILE, JSON.stringify(state, null, 2), "utf8");
};

export const loadSessionState = async (): Promise<SessionState> => {
  const raw = await readSession();
  if (!raw) return {};
  const state: SessionState = {};

  // H1 fields
  if (raw.delegator) {
    try {
      state.delegator = getAddress(raw.delegator) as `0x${string}`;
    } catch {
      state.delegator = undefined;
    }
  }
  if (raw.requireOnboard) {
    state.requireOnboard = true;
  }

  // H2 fields
  if (raw.sessionKeyAddress) {
    try {
      state.sessionKeyAddress = getAddress(raw.sessionKeyAddress) as `0x${string}`;
    } catch {
      state.sessionKeyAddress = undefined;
    }
  }
  if (raw.sessionKeyPrivateKey) {
    state.sessionKeyPrivateKey = raw.sessionKeyPrivateKey as `0x${string}`;
  }
  if (raw.ownerAddress) {
    try {
      state.ownerAddress = getAddress(raw.ownerAddress) as `0x${string}`;
    } catch {
      state.ownerAddress = undefined;
    }
  }
  if (raw.chainId) {
    state.chainId = raw.chainId;
  }

  return state;
};

export const saveDelegatorSession = async (delegator: `0x${string}`) => {
  await writeSession({ delegator, requireOnboard: false });
};

export const markRequireOnboarding = async () => {
  await writeSession({ requireOnboard: true });
};

export const clearSessionState = async () => {
  try {
    await fs.unlink(SESSION_FILE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
};

// ============================================================================
// H2 Session Management
// ============================================================================

export interface H2SessionData {
  delegator: `0x${string}`;
  sessionKeyAddress: `0x${string}`;
  sessionKeyPrivateKey: `0x${string}`;
  ownerAddress: `0x${string}`;
  chainId: number;
}

/**
 * Save complete H2 session data (after onboarding)
 */
export const saveH2Session = async (data: H2SessionData) => {
  await writeSession({
    delegator: data.delegator,
    sessionKeyAddress: data.sessionKeyAddress,
    sessionKeyPrivateKey: data.sessionKeyPrivateKey,
    ownerAddress: data.ownerAddress,
    chainId: data.chainId,
    requireOnboard: false,
  });
};

/**
 * Check if H2 session is complete (has all required fields)
 */
export const isH2SessionComplete = (state: SessionState): state is Required<SessionState> => {
  return !!(
    state.delegator &&
    state.sessionKeyAddress &&
    state.sessionKeyPrivateKey &&
    state.ownerAddress &&
    state.chainId &&
    !state.requireOnboard
  );
};

// ============================================================================
// H2 Persistent Session Key Storage (per smart account)
// ============================================================================

/**
 * Directory for persistent session keys (mapped by smart account)
 * Matches H1's pattern: ~/.pragma/session-keys/{delegator}/key.json
 */
const SESSION_KEYS_DIR = process.env.PRAGMA_DELEGATION_DIR
  ? path.join(process.env.PRAGMA_DELEGATION_DIR, "session-keys")
  : path.join(os.homedir(), ".pragma", "session-keys");

const SESSION_KEY_FILENAME = "session-key.json";

export interface H2SessionKeyRecord {
  address: `0x${string}`;
  privateKey: `0x${string}`;
  filePath: string;
  isNew: boolean;
}

/**
 * Get or create a persistent session key for a smart account (delegator)
 *
 * Matches H1's `getOrCreateSessionKey` pattern:
 * - Session keys are stored per smart account address
 * - Reused across logins (1 account = 1 session key)
 * - Only generate new key if one doesn't exist
 *
 * @param delegator - Smart account address
 * @returns Session key record with isNew flag
 */
export const getOrCreateH2SessionKey = async (delegator: `0x${string}`): Promise<H2SessionKeyRecord> => {
  const normalizedDelegator = getAddress(delegator);
  const delegatorDir = path.join(SESSION_KEYS_DIR, normalizedDelegator.toLowerCase());
  await fs.mkdir(delegatorDir, { recursive: true });

  const keyPath = path.join(delegatorDir, SESSION_KEY_FILENAME);

  // Try to load existing session key
  try {
    const raw = await fs.readFile(keyPath, "utf8");
    const stored = JSON.parse(raw) as {
      sessionKeyPrivateKey?: string;
      sessionKeyAddress?: string;
      privateKey?: string;
      address?: string;
      createdAt?: number;
    };

    const storedPrivateKey = (stored.sessionKeyPrivateKey ?? stored.privateKey) as `0x${string}` | undefined;
    const storedAddress = (stored.sessionKeyAddress ?? stored.address) as `0x${string}` | undefined;

    if (storedPrivateKey && storedAddress) {
      // Validate the key pair matches
      const { privateKeyToAccount } = await import("viem/accounts");
      const account = privateKeyToAccount(storedPrivateKey);
      const resolvedAddress = getAddress(storedAddress);

      if (account.address.toLowerCase() === resolvedAddress.toLowerCase()) {
        return {
          privateKey: storedPrivateKey,
          address: resolvedAddress,
          filePath: keyPath,
          isNew: false,
        };
      }

      console.warn(
        `Session key address mismatch for ${normalizedDelegator}; regenerating`,
      );
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.warn(`Failed reading session key for ${normalizedDelegator}; regenerating`);
    }
  }

  // Generate new session key
  const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
  const freshPrivateKey = generatePrivateKey();
  const freshAccount = privateKeyToAccount(freshPrivateKey);

  const payload = {
    sessionKeyAddress: freshAccount.address,
    sessionKeyPrivateKey: freshPrivateKey,
    createdAt: Date.now(),
  };

  await fs.writeFile(keyPath, JSON.stringify(payload, null, 2));

  return {
    address: freshAccount.address as `0x${string}`,
    privateKey: freshPrivateKey,
    filePath: keyPath,
    isNew: true,
  };
};

/**
 * Logout H2 session (clear active session, keep persistent session keys)
 *
 * This clears the current login state but preserves session keys
 * so they can be reused when the user logs in again.
 */
export const logoutH2Session = async () => {
  await writeSession({
    requireOnboard: true,
  });
};
