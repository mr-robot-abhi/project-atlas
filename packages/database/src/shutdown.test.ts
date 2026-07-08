import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { EventEmitter } from "node:events";
import { createLogger } from "@repo/logger";

import { registerDatabaseShutdownHooks } from "./shutdown.js";

/**
 * Process is an EventEmitter; we use a unique signal name-safe pattern by
 * attaching and verifying listener counts rather than emitting real SIGINT.
 */
describe("registerDatabaseShutdownHooks", () => {
  const logger = createLogger({ level: "silent", environment: "test" });
  const signal = "SIGUSR2" as NodeJS.Signals;

  afterEach(() => {
    process.removeAllListeners(signal);
  });

  it("registers and unregisters signal listeners", () => {
    const before = process.listenerCount(signal);

    const registration = registerDatabaseShutdownHooks({
      signals: [signal],
      logger,
      timeoutMs: 1_000,
      onSignal: async () => {
        // no-op
      },
    });

    assert.equal(process.listenerCount(signal), before + 1);

    registration.unregister();

    assert.equal(process.listenerCount(signal), before);
  });

  it("invokes onSignal exactly once for the first emission", async () => {
    let invocations = 0;

    const registration = registerDatabaseShutdownHooks({
      signals: [signal],
      logger,
      timeoutMs: 5_000,
      onSignal: async () => {
        invocations += 1;
      },
    });

    // Intercept process.exit so the handler does not terminate the test runner.
    const originalExit = process.exit;
    let exitCode: number | undefined;
    (
      process as NodeJS.Process & {
        exit: (code?: number) => never;
      }
    ).exit = ((code?: number) => {
      exitCode = code ?? 0;
      return undefined as never;
    }) as typeof process.exit;

    try {
      process.emit(signal);
      // Allow the async shutdown path to settle.
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      process.emit(signal);
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });

      assert.equal(invocations, 1);
      assert.equal(exitCode, 0);
      assert.ok(process instanceof EventEmitter);
    } finally {
      process.exit = originalExit;
      registration.unregister();
    }
  });
});
