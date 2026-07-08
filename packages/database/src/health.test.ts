import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Connection } from "mongoose";
import { createLogger } from "@repo/logger";

import { assertDatabaseHealthy, checkDatabaseHealth } from "./health.js";
import { DatabaseHealthError } from "./errors.js";

/**
 * Builds a minimal connection stub for health-check unit tests.
 *
 * @param overrides - Partial connection fields to apply.
 * @returns A Connection-like object acceptable to the health helpers.
 */
function createConnectionStub(
  overrides: {
    readonly readyState?: number;
    readonly db?:
      | {
          command: (doc: unknown) => Promise<unknown>;
        }
      | undefined;
  } = {},
): Connection {
  return {
    readyState: overrides.readyState ?? 1,
    db: overrides.db,
  } as unknown as Connection;
}

describe("checkDatabaseHealth", () => {
  const logger = createLogger({ level: "silent", environment: "test" });

  it("reports unhealthy when the connection is not ready", async () => {
    const status = await checkDatabaseHealth(
      createConnectionStub({ readyState: 0 }),
      logger,
    );

    assert.equal(status.healthy, false);
    assert.equal(status.state, "disconnected");
    assert.equal(status.latencyMs, null);
    assert.match(status.error ?? "", /not connected/i);
  });

  it("reports unhealthy when the native Db handle is missing", async () => {
    const status = await checkDatabaseHealth(
      createConnectionStub({ readyState: 1, db: undefined }),
      logger,
    );

    assert.equal(status.healthy, false);
    assert.match(status.error ?? "", /unavailable/i);
  });

  it("reports healthy when ping returns ok=1", async () => {
    const status = await checkDatabaseHealth(
      createConnectionStub({
        readyState: 1,
        db: {
          async command() {
            return { ok: 1 };
          },
        },
      }),
      logger,
    );

    assert.equal(status.healthy, true);
    assert.equal(status.state, "connected");
    assert.equal(typeof status.latencyMs, "number");
    assert.equal(status.error, undefined);
  });

  it("reports unhealthy when ping throws", async () => {
    const status = await checkDatabaseHealth(
      createConnectionStub({
        readyState: 1,
        db: {
          async command() {
            throw new Error("socket hang up");
          },
        },
      }),
      logger,
    );

    assert.equal(status.healthy, false);
    assert.match(status.error ?? "", /socket hang up/);
  });
});

describe("assertDatabaseHealthy", () => {
  const logger = createLogger({ level: "silent", environment: "test" });

  it("returns the status when healthy", async () => {
    const status = await assertDatabaseHealthy(
      createConnectionStub({
        readyState: 1,
        db: {
          async command() {
            return { ok: 1 };
          },
        },
      }),
      logger,
    );

    assert.equal(status.healthy, true);
  });

  it("throws DatabaseHealthError when unhealthy", async () => {
    await assert.rejects(
      () =>
        assertDatabaseHealthy(
          createConnectionStub({ readyState: 0 }),
          logger,
        ),
      (error: unknown) => {
        assert.ok(error instanceof DatabaseHealthError);
        return true;
      },
    );
  });
});
