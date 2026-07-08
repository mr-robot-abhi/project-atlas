import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createLogger } from "@repo/logger";

import {
  connectDatabase,
  disconnectDatabase,
  getDatabase,
  hasDatabase,
  resetDatabaseForTests,
} from "./connection.js";
import { DatabaseConnectionError } from "./errors.js";

describe("database singleton guards", () => {
  afterEach(() => {
    resetDatabaseForTests();
  });

  it("throws when getDatabase is called before connect", () => {
    assert.equal(hasDatabase(), false);
    assert.throws(() => getDatabase(), DatabaseConnectionError);
  });

  it("fails fast when URI cannot be resolved and config is unloaded", async () => {
    const logger = createLogger({ level: "silent", environment: "test" });

    await assert.rejects(
      () =>
        connectDatabase({
          logger,
          registerShutdownHooks: false,
          // Intentionally omit uri; getConfig will throw without a prior load.
        }),
      (error: unknown) => {
        assert.ok(error instanceof DatabaseConnectionError);
        assert.match(error.message, /URI is required|Failed to connect/i);
        return true;
      },
    );
  });

  it("disconnectDatabase is a no-op when never connected", async () => {
    await assert.doesNotReject(() => disconnectDatabase());
  });
});
