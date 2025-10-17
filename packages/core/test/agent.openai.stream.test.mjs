import test from "node:test";
import assert from "node:assert/strict";

const { createOpenAiInsightStreamer } = await import("../dist/agent/openai.js");

class FakeResponseStream {
  constructor(chunks, finalText) {
    this._chunks = chunks;
    this._finalText = finalText;
  }

  async *[Symbol.asyncIterator]() {
    for (const delta of this._chunks) {
      yield { type: "response.output_text.delta", delta };
    }
  }

  async finalResponse() {
    return { finalOutput: this._finalText };
  }
}

class FakeOpenAiClient {
  constructor(chunks, finalText, onFallback) {
    this._chunks = chunks;
    this._finalText = finalText;
    this._onFallback = onFallback;
    this.responses = {
      stream: async () => new FakeResponseStream(this._chunks, this._finalText),
      create: async () => {
        if (this._onFallback) {
          this._onFallback();
        }
        return { finalOutput: this._finalText };
      },
    };
  }
}

test("insight streamer avoids duplicating final output", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalTimeout = process.env.PRAGMA_AGENT_STREAM_TIMEOUT_MS;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.PRAGMA_AGENT_STREAM_TIMEOUT_MS = "0";

  const streamChunks = ["A blockchain ", "is a distributed ledger."];
  const finalText = streamChunks.join("");
  let fallbackInvoked = false;

  const originalFactory = globalThis.__PRAGMA_OPENAI_CLIENT_FACTORY__;
  globalThis.__PRAGMA_OPENAI_CLIENT_FACTORY__ = () =>
    new FakeOpenAiClient(streamChunks, finalText, () => {
      fallbackInvoked = true;
    });

  try {
    const streamer = createOpenAiInsightStreamer();
    assert.equal(typeof streamer, "function");

    const context = {
      delegation: {
        mode: "normal",
        allowedTokens: [],
        nativeTokenSymbol: "MON",
        nativeTokenAddress: "0x0000000000000000000000000000000000000000",
        wrappedNativeSymbol: "WMON",
        wrappedNativeAddress: "0x0000000000000000000000000000000000000001",
      },
      metadata: { delegator: "0x0000000000000000000000000000000000000000" },
    };

    const result = await streamer("Explain blockchain basics", context);
    assert.ok(result);

    let streamed = "";
    for await (const chunk of result.stream) {
      streamed += chunk;
    }

    assert.equal(streamed, finalText);

    const collected = await result.collect();
    assert.equal(collected, finalText);
    assert.equal(streamed, collected);
    assert.equal(fallbackInvoked, false);
  } finally {
    if (originalFactory === undefined) {
      delete globalThis.__PRAGMA_OPENAI_CLIENT_FACTORY__;
    } else {
      globalThis.__PRAGMA_OPENAI_CLIENT_FACTORY__ = originalFactory;
    }
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
    if (originalTimeout === undefined) {
      delete process.env.PRAGMA_AGENT_STREAM_TIMEOUT_MS;
    } else {
      process.env.PRAGMA_AGENT_STREAM_TIMEOUT_MS = originalTimeout;
    }
  }
});
