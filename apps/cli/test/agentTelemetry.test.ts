import test from "node:test";
import assert from "node:assert/strict";

import {
  __testables,
  logAgentEvent,
  logAgentInput,
} from "../src/services/agentTelemetry.js";

const ORIGINAL_WRITE = process.stderr.write;

const withPatchedStderr = async (
  fn: (writes: string[]) => void | Promise<void>,
): Promise<void> => {
  const writes: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr.write as any) = (chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  };
  try {
    await fn(writes);
  } finally {
    process.stderr.write = ORIGINAL_WRITE;
  }
};

test("agent telemetry disabled by default", async () => {
  delete process.env.PRAGMA_AGENT_LOG;
  delete process.env.PRAGMA_AGENT_DEBUG;
  delete process.env.PRAGMA_AGENT_LOG_LEVEL;

  const { isLoggingEnabled } = __testables;
  assert.equal(isLoggingEnabled(), false);

  await withPatchedStderr(async (writes) => {
    logAgentEvent("test_event", { sample: true });
    assert.equal(writes.length, 0);
  });
});

const enableLogging = () => {
  process.env.PRAGMA_AGENT_LOG = "1";
};

test("agent telemetry emits structured JSON when enabled", async () => {
  enableLogging();

  await withPatchedStderr(async (writes) => {
    logAgentEvent("agent_test", { sample: true });
    assert.equal(writes.length, 1);
    const parsed = JSON.parse(writes[0]);
    assert.equal(parsed.event, "agent_test");
    assert.equal(parsed.sample, true);
    assert.equal(parsed.level, "info");
    assert.ok(typeof parsed.ts === "string");
  });
});

test("logAgentInput truncates long messages", async () => {
  enableLogging();

  const longLine = "x".repeat(1024);

  await withPatchedStderr(async (writes) => {
    logAgentInput({
      delegator: "0x0000000000000000000000000000000000000000",
      line: longLine,
      isMeta: false,
    });
    assert.equal(writes.length, 1);
    const parsed = JSON.parse(writes[0]);
    assert.equal(parsed.event, "agent_input");
    assert.equal(parsed.delegator, "0x0000000000000000000000000000000000000000");
    assert.equal(parsed.meta, false);
    assert.ok(parsed.line.length <= 513); // 512 chars + ellipsis
    assert.match(parsed.line, /…$/u);
  });
});
