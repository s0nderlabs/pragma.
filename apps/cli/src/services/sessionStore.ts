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
}

export interface SessionState {
  delegator?: `0x${string}`;
  requireOnboard?: boolean;
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
