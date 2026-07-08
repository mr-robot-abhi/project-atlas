import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createLogger,
  getLogger,
  initLogger,
  parseLogLevel,
  parseLoggerEnvironment,
  resetLogger,
  serializeError,
  shouldUsePrettyTransport,
} from "./index.js";

/**
 * Creates a collector that accumulates NDJSON log lines from a destination stream.
 *
 * @param stream - Destination pass-through used by the logger under test.
 * @returns A function that parses and returns all lines received so far.
 */
function createLineCollector(stream: PassThrough): () => unknown[] {
  const chunks: Buffer[] = [];

  stream.on("data", (chunk: Buffer | string) => {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  });

  return (): unknown[] => {
    const text = Buffer.concat(chunks).toString("utf8");
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as unknown);
  };
}

describe("parseLogLevel", () => {
  it("accepts known levels case-insensitively", () => {
    assert.equal(parseLogLevel("DEBUG"), "debug");
    assert.equal(parseLogLevel("info"), "info");
  });

  it("returns undefined for unknown values", () => {
    assert.equal(parseLogLevel("verbose"), undefined);
    assert.equal(parseLogLevel(undefined), undefined);
  });
});

describe("parseLoggerEnvironment", () => {
  it("accepts known environments", () => {
    assert.equal(parseLoggerEnvironment("production"), "production");
    assert.equal(parseLoggerEnvironment("Development"), "development");
  });

  it("returns undefined for unknown values", () => {
    assert.equal(parseLoggerEnvironment("local"), undefined);
  });
});

describe("shouldUsePrettyTransport", () => {
  it("defaults to pretty only in development", () => {
    assert.equal(shouldUsePrettyTransport("development", undefined), true);
    assert.equal(shouldUsePrettyTransport("production", undefined), false);
    assert.equal(shouldUsePrettyTransport("staging", undefined), false);
    assert.equal(shouldUsePrettyTransport("test", undefined), false);
  });

  it("honors an explicit pretty override", () => {
    assert.equal(shouldUsePrettyTransport("production", true), true);
    assert.equal(shouldUsePrettyTransport("development", false), false);
  });
});

describe("serializeError", () => {
  it("serializes Error instances with type, message, and stack", () => {
    const error = new TypeError("boom");
    const serialized = serializeError(error);

    assert.equal(serialized["type"], "TypeError");
    assert.equal(serialized["message"], "boom");
    assert.equal(typeof serialized["stack"], "string");
  });

  it("includes nested cause chains", () => {
    const root = new Error("root", { cause: new Error("cause") });
    const serialized = serializeError(root);

    assert.equal(serialized["message"], "root");
    assert.ok(serialized["cause"]);
    assert.equal(
      (serialized["cause"] as { message: string }).message,
      "cause",
    );
  });

  it("wraps non-error values", () => {
    assert.deepEqual(serializeError("string-fail"), {
      type: "NonError",
      message: "string-fail",
    });
  });
});

describe("createLogger", () => {
  it("emits JSON with requestId and error serialization", async () => {
    const stream = new PassThrough();
    const flush = createLineCollector(stream);
    const logger = createLogger({
      level: "info",
      environment: "production",
      pretty: false,
      destination: stream,
      requestId: "req-123",
      base: { service: "test" },
    });

    logger.info({ foo: "bar" }, "hello");
    logger.error({ err: new Error("failed") }, "operation failed");

    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    const records = flush();
    assert.ok(records.length >= 2);

    const info = records[0] as Record<string, unknown>;
    assert.equal(info["msg"], "hello");
    assert.equal(info["requestId"], "req-123");
    assert.equal(info["service"], "test");
    assert.equal(info["foo"], "bar");

    const errorLine = records[1] as Record<string, unknown>;
    assert.equal(errorLine["msg"], "operation failed");
    const err = errorLine["err"] as Record<string, unknown>;
    assert.equal(err["message"], "failed");
    assert.equal(typeof err["stack"], "string");
  });

  it("creates child loggers that inherit and extend bindings", async () => {
    const stream = new PassThrough();
    const flush = createLineCollector(stream);
    const root = createLogger({
      level: "info",
      environment: "production",
      destination: stream,
    });

    const child = root.withRequestId("req-child", { userId: "u-1" });
    child.info("scoped");

    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    const records = flush();
    assert.equal(records.length, 1);
    const line = records[0] as Record<string, unknown>;
    assert.equal(line["requestId"], "req-child");
    assert.equal(line["userId"], "u-1");
    assert.equal(line["msg"], "scoped");
  });

  it("respects silent level for unit tests", () => {
    const stream = new PassThrough();
    let received = false;
    stream.on("data", () => {
      received = true;
    });

    const logger = createLogger({
      level: "silent",
      environment: "test",
      destination: stream,
    });

    logger.info("should not appear");
    assert.equal(logger.isLevelEnabled("info"), false);
    assert.equal(received, false);
  });
});

describe("singleton logger", () => {
  beforeEach(() => {
    resetLogger();
  });

  afterEach(() => {
    resetLogger();
  });

  it("initLogger and getLogger share one instance", () => {
    const stream = new PassThrough();
    const first = initLogger({
      level: "silent",
      environment: "test",
      destination: stream,
    });
    const second = getLogger();

    assert.equal(first, second);
  });

  it("resetLogger clears the cache so a new instance is created", () => {
    const streamA = new PassThrough();
    const first = initLogger({
      level: "silent",
      environment: "test",
      destination: streamA,
    });

    resetLogger();

    const streamB = new PassThrough();
    const second = initLogger({
      level: "silent",
      environment: "test",
      destination: streamB,
    });

    assert.notEqual(first, second);
  });
});
