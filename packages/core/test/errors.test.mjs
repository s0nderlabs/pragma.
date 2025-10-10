import test from "node:test";
import assert from "node:assert/strict";

const {
  createErrorFromCode,
  ERROR_DEFINITIONS,
  isPragmaError,
  toPlainError,
} = await import("../dist/errors/index.js");

test("createErrorFromCode yields PragmaError with defaults", () => {
  const err = createErrorFromCode("AMOUNT_MALFORMED");
  const def = ERROR_DEFINITIONS.AMOUNT_MALFORMED;
  assert.equal(err.code, def.code);
  assert.equal(err.class, def.class);
  assert.equal(err.module, def.module);
  assert.equal(err.severity, def.severity);
  assert.equal(err.retriable, def.retriable);
  assert.equal(err.message, def.defaultMessage);
  assert.ok(isPragmaError(err));
});

test("createErrorFromCode supports overrides and context", () => {
  const err = createErrorFromCode("SIM_BALANCE_TOO_LOW", {
    message: "Balance below required amount.",
    context: { token: "0x1234", remaining: "1.0" },
    retriable: true,
  });
  assert.equal(err.message, "Balance below required amount.");
  assert.equal(err.code, "SIM_BALANCE_TOO_LOW");
  assert.equal(err.retriable, true);
  assert.deepEqual(err.context, { token: "0x1234", remaining: "1.0" });

  const plain = toPlainError(err);
  assert.equal(plain.code, "SIM_BALANCE_TOO_LOW");
  assert.equal(plain.class, "Simulation");
  assert.equal(plain.module, "Simulation");
  assert.equal(plain.retriable, true);
  assert.equal(plain.severity, ERROR_DEFINITIONS.SIM_BALANCE_TOO_LOW.severity);
});
