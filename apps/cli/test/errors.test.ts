import test from "node:test";
import assert from "node:assert/strict";

import { createErrorFromCode, isPragmaError } from "@pragma/core";
import {
  formatPragmaError,
  normalizePragmaError,
  serializePragmaError,
} from "../src/utils/errors.js";

test("normalizePragmaError returns existing PragmaError", () => {
  const original = createErrorFromCode("SIM_BALANCE_TOO_LOW", {
    message: "Balance too low",
  });
  const normalized = normalizePragmaError(original);
  assert.strictEqual(normalized, original);
  assert.ok(isPragmaError(normalized));
  assert.equal(formatPragmaError(normalized), `[${original.code}] ${original.message}`);
});

test("normalizePragmaError wraps plain Error", () => {
  const normalized = normalizePragmaError(new Error("plain failure"));
  assert.ok(isPragmaError(normalized));
  assert.equal(normalized.code, "INTERNAL_ASSERTION_FAILED");
  assert.equal(normalized.message, "plain failure");
  const serialized = serializePragmaError(normalized);
  assert.equal(serialized.code, "INTERNAL_ASSERTION_FAILED");
  assert.equal(serialized.message, "plain failure");
});
