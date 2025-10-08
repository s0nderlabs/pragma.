interface AgentLogPayload {
  [key: string]: unknown;
}

const LOG_ENV_VARS = ["PRAGMA_AGENT_LOG", "PRAGMA_AGENT_DEBUG"] as const;
const LOG_LEVEL_ENV = "PRAGMA_AGENT_LOG_LEVEL";
const TRUNCATE_LENGTH = 512;

const normalizeFlag = (value: string | undefined): string | undefined =>
  value?.trim().toLowerCase();

const isLoggingEnabled = (): boolean => {
  const level = normalizeFlag(process.env[LOG_LEVEL_ENV]);
  if (level === "silent" || level === "off") return false;

  for (const envKey of LOG_ENV_VARS) {
    const normalized = normalizeFlag(process.env[envKey]);
    if (normalized && normalized !== "0" && normalized !== "false") {
      return true;
    }
  }
  return level === "info" || level === "debug";
};

const truncate = (value: string, max = TRUNCATE_LENGTH): string =>
  value.length <= max ? value : `${value.slice(0, max)}…`;

const safeSerialize = (payload: AgentLogPayload): string => {
  const base = {
    ts: new Date().toISOString(),
    ...payload,
  } satisfies AgentLogPayload;
  try {
    return JSON.stringify(base);
  } catch (error) {
    return JSON.stringify({
      ts: base.ts,
      event: "agent_log_error",
      error: (error as Error).message,
    });
  }
};

export const logAgentEvent = (event: string, payload: AgentLogPayload = {}): void => {
  if (!isLoggingEnabled()) return;
  const base: AgentLogPayload = { event, level: payload.level ?? "info", ...payload };
  const record = safeSerialize(base);
  process.stderr.write(`${record}\n`);
};

export const logAgentContextLoaded = (params: {
  delegator: `0x${string}`;
  mode: string;
  tokens: string[];
  sessionKey?: `0x${string}`;
}): void => {
  logAgentEvent("agent_context_loaded", {
    delegator: params.delegator,
    mode: params.mode,
    tokens: params.tokens,
    sessionKey: params.sessionKey,
  });
};

export const logAgentInput = (params: {
  delegator: `0x${string}`;
  line: string;
  isMeta: boolean;
}): void => {
  logAgentEvent("agent_input", {
    delegator: params.delegator,
    line: truncate(params.line),
    meta: params.isMeta,
  });
};

export const logAgentMetaCommand = (params: {
  delegator: `0x${string}`;
  command: string;
}): void => {
  logAgentEvent("agent_meta_command", {
    delegator: params.delegator,
    command: params.command,
  });
};

export const logAgentResponse = (params: {
  delegator: `0x${string}`;
  type: string;
  extra?: AgentLogPayload;
}): void => {
  logAgentEvent("agent_response", {
    delegator: params.delegator,
    type: params.type,
    ...params.extra,
  });
};

export const logAgentError = (params: {
  delegator?: `0x${string}`;
  error: unknown;
  phase?: string;
}): void => {
  const message = params.error instanceof Error ? params.error.message : String(params.error);
  logAgentEvent("agent_error", {
    level: "error",
    delegator: params.delegator,
    phase: params.phase,
    message,
  });
};

export const __testables = {
  isLoggingEnabled,
  truncate,
};
